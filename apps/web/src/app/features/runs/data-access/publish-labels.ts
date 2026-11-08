import type {
  PublishCardState,
  PublishPrivacyLevel,
} from '@peertoreel/contracts';

const PRIVACY_LABELS: Record<PublishPrivacyLevel, string> = {
  PUBLIC_TO_EVERYONE: 'Все пользователи',
  MUTUAL_FOLLOW_FRIENDS: 'Взаимные подписки',
  FOLLOWER_OF_CREATOR: 'Подписчики',
  SELF_ONLY: 'Только я',
};

const CARD_STATE_LABELS: Record<PublishCardState, string> = {
  draft: 'Черновик',
  exported: 'Выгружено',
  published: 'Опубликовано',
  failed: 'Ошибка',
};

export function publishPrivacyLabel(level: PublishPrivacyLevel): string {
  return PRIVACY_LABELS[level];
}

export function publishCardStateLabel(state: PublishCardState): string {
  return CARD_STATE_LABELS[state];
}
