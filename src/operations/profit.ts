import type { ProfitInputs, ProfitResult } from './types';

export const cents = (value: number) => Math.round((value + Number.EPSILON) * 100) / 100;
export const PROFIT_KEYS: (keyof ProfitInputs)[] = ['arv', 'repairs', 'rehabContingencyPercent', 'buyerClosingHoldingCosts', 'buyerProfitPercent', 'sellerPrice', 'buyerPrice', 'targetAssignmentFee', 'operatorClosingCosts', 'marketingBudget', 'otherDealCosts'];
export function calculateProfitScenario(input: ProfitInputs): ProfitResult {
  const missing = PROFIT_KEYS.filter(key => input[key] === null || !Number.isFinite(input[key]) || input[key]! < 0 || input[key]! > (key.endsWith('Percent') ? 1 : 100_000_000));
  const valid = (keys: (keyof ProfitInputs)[]) => keys.every(key => !missing.includes(key));
  const rehabContingency = valid(['repairs', 'rehabContingencyPercent']) ? cents(input.repairs! * input.rehabContingencyPercent!) : null;
  const buyerCeiling = valid(['arv', 'buyerProfitPercent', 'repairs', 'rehabContingencyPercent', 'buyerClosingHoldingCosts'])
    ? cents(input.arv! * (1 - input.buyerProfitPercent!) - input.repairs! * (1 + input.rehabContingencyPercent!) - input.buyerClosingHoldingCosts!) : null;
  const maximumSellerOffer = buyerCeiling !== null && valid(['targetAssignmentFee']) ? cents(buyerCeiling - input.targetAssignmentFee!) : null;
  const assignmentSpread = valid(['buyerPrice', 'sellerPrice']) ? cents(input.buyerPrice! - input.sellerPrice!) : null;
  const projectedNet = assignmentSpread !== null && valid(['operatorClosingCosts', 'marketingBudget', 'otherDealCosts'])
    ? cents(assignmentSpread - input.operatorClosingCosts! - input.marketingBudget! - input.otherDealCosts!) : null;
  const buyerHeadroom = buyerCeiling !== null && valid(['buyerPrice']) ? cents(buyerCeiling - input.buyerPrice!) : null;
  const warnings: string[] = [];
  if (missing.length) warnings.push('Some assumptions are unknown. Dependent calculations remain unavailable.');
  if (projectedNet !== null && projectedNet < 0) warnings.push('The entered deal assumptions produce a projected loss.');
  if (buyerHeadroom !== null && buyerHeadroom < 0) warnings.push('The buyer price exceeds the modeled buyer ceiling.');
  if (maximumSellerOffer !== null && maximumSellerOffer < 0) warnings.push('These costs and margins leave no positive maximum seller offer.');
  return { rehabContingency, buyerCeiling, maximumSellerOffer, assignmentSpread, projectedNet, buyerHeadroom, missing, warnings };
}
