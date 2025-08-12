import { Body, Controller, Post, UseGuards } from '@nestjs/common';

import { ApiKeyService } from 'src/engine/core-modules/api-key/api-key.service';
import { CreateUserAndWorkspaceInput } from 'src/engine/core-modules/auth/dto/create-user-and-workspace.input';
import { SignInUpService } from 'src/engine/core-modules/auth/services/sign-in-up.service';
import { DomainManagerService } from 'src/engine/core-modules/domain-manager/services/domain-manager.service';
import { OnboardingService } from 'src/engine/core-modules/onboarding/onboarding.service';
import { UserWorkspaceService } from 'src/engine/core-modules/user-workspace/user-workspace.service';
import { UserService } from 'src/engine/core-modules/user/services/user.service';
import { WorkspaceService } from 'src/engine/core-modules/workspace/services/workspace.service';
import { ApiKeyGuard } from 'src/engine/guards/api-key-guard';
import { RoleService } from 'src/engine/metadata-modules/role/role.service';
import { UserRoleService } from 'src/engine/metadata-modules/user-role/user-role.service';

@Controller('auth/api')
@UseGuards(ApiKeyGuard)
export class ApiAuthController {
  constructor(
    private readonly signInUpService: SignInUpService,
    private readonly domainManagerService: DomainManagerService,
    private readonly apiKeyService: ApiKeyService,
    private readonly workspaceService: WorkspaceService,
    private readonly roleService: RoleService,
    private readonly userRoleService: UserRoleService,
    private readonly userWorkspaceService: UserWorkspaceService,
    private readonly userService: UserService,
    private readonly onboardingService: OnboardingService,
  ) {}

  @Post('create-user-and-workspace')
  async createUserAndWorkspace(@Body() userData: CreateUserAndWorkspaceInput) {
    try {
      const { user, workspace } =
        await this.signInUpService.signUpOnNewWorkspace({
          type: 'newUserWithPicture',
          newUserWithPicture: userData,
        });

      await this.workspaceService.activateWorkspace(user, workspace, {
        displayName: userData.workspaceName,
      });

      const defaultRoles = await this.roleService.getWorkspaceRoles(
        workspace.id,
      );

      const adminRole = defaultRoles.find((role) => role.label === 'Admin');
      const memberRole = defaultRoles.find((role) => role.label === 'Member');

      if (!memberRole || !adminRole) {
        throw new Error('Default roles not found');
      }

      // lock down member role
      await this.roleService.updateRole({
        input: {
          id: memberRole.id,
          update: {
            canDestroyAllObjectRecords: false,
            canUpdateAllSettings: false,
            canAccessAllTools: true,
          },
        },
        workspaceId: workspace.id,
      });

      // grab the new user's userWorkspace record
      const userWorkspace =
        await this.userWorkspaceService.getUserWorkspaceForUserOrThrow({
          userId: user.id,
          workspaceId: workspace.id,
        });

      // update defaults for workspace
      await this.workspaceService.updateWorkspaceById({
        userWorkspaceId: userWorkspace.id,
        payload: {
          id: workspace.id,
          // isPasswordAuthEnabled: false,
          defaultRoleId: memberRole?.id,
          displayName: userData.workspaceName,
        },
      });

      // add default tim@apple.com super admin as a user of this workspace
      // this will allow us to change the broker's user into a controlled 'member' account
      // twenty won't allow a workspace with no admin account assigned
      const superAdminUser =
        await this.userService.getUserByEmail('tim@apple.dev');

      await this.userWorkspaceService.addUserToWorkspaceIfUserNotInWorkspace(
        superAdminUser,
        { ...workspace, defaultRoleId: adminRole.id },
      );

      // assign member role to the broker user
      await this.userRoleService.assignRoleToUserWorkspace({
        roleId: memberRole.id,
        userWorkspaceId: userWorkspace.id,
        workspaceId: workspace.id,
      });

      // mark the invite team onboarding step as complete (member role can't interact with it..)
      await this.onboardingService.setOnboardingInviteTeamPending({
        workspaceId: workspace.id,
        value: false,
      });

      // mark the book onboarding step as complete
      await this.onboardingService.setOnboardingBookOnboardingPending({
        workspaceId: workspace.id,
        value: false,
      });

      // Create an API key for the workspace, valid for 5 year
      const oneYearMs = 5 * 365 * 24 * 60 * 60 * 1000;
      const expiresAt = new Date(Date.now() + oneYearMs);

      const apiKey = await this.apiKeyService.create({
        name: 'Webapp',
        workspaceId: workspace.id,
        expiresAt,
        roleId: adminRole.id,
      });

      const apiToken = await this.apiKeyService.generateApiKeyToken(
        workspace.id,
        apiKey.id,
      );

      return {
        userId: user.id,
        workspaceId: workspace.id,
        workspaceUrls: this.domainManagerService.getWorkspaceUrls(workspace),
        apiToken: apiToken?.token,
        expiresAt,
      };
    } catch (error) {
      console.log(error);

      console.error('Error creating user and workspace:', error);
      throw error;
    }
  }
}
