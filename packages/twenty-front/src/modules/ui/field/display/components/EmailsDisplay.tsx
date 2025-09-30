import { useMemo } from 'react';

import { currentUserState } from '@/auth/states/currentUserState';
import { type FieldEmailsValue } from '@/object-record/record-field/ui/types/FieldMetadata';
import { ExpandableList } from '@/ui/layout/expandable-list/components/ExpandableList';
import { styled } from '@linaria/react';
import { useRecoilValue } from 'recoil';
import { isDefined } from 'twenty-shared/utils';
import { RoundedLink } from 'twenty-ui/navigation';
import { THEME_COMMON } from 'twenty-ui/theme';

type EmailsDisplayProps = {
  value?: FieldEmailsValue;
  isFocused?: boolean;
};

const themeSpacing = THEME_COMMON.spacingMultiplicator;

const StyledContainer = styled.div`
  align-items: center;
  display: flex;
  gap: ${themeSpacing * 1}px;
  justify-content: flex-start;

  max-width: 100%;

  overflow: hidden;

  width: 100%;
`;

export const EmailsDisplay = ({ value, isFocused }: EmailsDisplayProps) => {
  const currentUser = useRecoilValue(currentUserState);
  const emails = useMemo(
    () =>
      [
        value?.primaryEmail ? value.primaryEmail : null,
        ...(value?.additionalEmails ?? []),
      ].filter(isDefined),
    [value?.primaryEmail, value?.additionalEmails],
  );

  const generateEmailUrl = (email: string, currentUserEmail?: string) => {
    return `https://mail.google.com/mail/?fs=1&to=${email}&tf=cm&authuser=${currentUserEmail ? encodeURIComponent(currentUserEmail) : ''}`;
  };

  return isFocused ? (
    <ExpandableList isChipCountDisplayed>
      {emails.map((email, index) => {
        const url = generateEmailUrl(email, currentUser?.email);
        return <RoundedLink key={index} label={email} href={url} />;
      })}
    </ExpandableList>
  ) : (
    <StyledContainer>
      {emails.map((email, index) => {
        const url = generateEmailUrl(email, currentUser?.email);
        return <RoundedLink key={index} label={email} href={url} />;
      })}
    </StyledContainer>
  );
};
