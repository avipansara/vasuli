import { groupDetailGroupMutation } from './group-detail-group-mutation';
import { groupDetailMemberMutation } from './group-detail-member-mutation';
import { groupDetailMutationModule } from './group-detail-mutation';
import { groupDetailSettlementMutation } from './group-detail-settlement-mutation';

/**
 * Public mutation boundary for Group detail routes.
 *
 * Operation-specific implementations stay narrow and testable, but callers
 * depend on this one controller so persistence and cache policy do not leak
 * back into the route.
 */
export const groupDetailMutationController = {
  ...groupDetailMutationModule,
  ...groupDetailMemberMutation,
  ...groupDetailSettlementMutation,
  ...groupDetailGroupMutation,
};
