import { abi, augur, constants } from '../../../services/augurjs';
import { SUCCESS } from '../../transactions/constants/statuses';
import { BINARY, SCALAR } from '../../markets/constants/market-types';
import { formatEther, formatPercent, formatShares } from '../../../utils/format-number';
import { formatDate } from '../../../utils/format-date';
import { updateTransactionsData } from '../../transactions/actions/update-transactions-data';
import { loadMarketsInfo } from '../../markets/actions/load-markets-info';
import { selectMarketLink } from '../../link/selectors/links';

export const UPDATE_ACCOUNT_TRADES_DATA = 'UPDATE_ACCOUNT_TRADES_DATA';
export const UPDATE_ACCOUNT_POSITIONS_DATA = 'UPDATE_ACCOUNT_POSITIONS_DATA';
export const UPDATE_COMPLETE_SETS_BOUGHT = 'UPDATE_COMPLETE_SETS_BOUGHT';
export const UPDATE_NET_EFFECTIVE_TRADES_DATA = 'UPDATE_NET_EFFECTIVE_TRADES_DATA';
export const UPDATE_SELL_COMPLETE_SETS_LOCK = 'UPDATE_SELL_COMPLETE_SETS_LOCK';
export const UPDATE_SMALLEST_POSITIONS = 'UPDATE_SMALLEST_POSITIONS';

export function updateSmallestPositions(marketID, smallestPosition) {
	return (dispatch) => {
		dispatch({ type: UPDATE_SMALLEST_POSITIONS, marketID, smallestPosition });
	};
}

export function updateSellCompleteSetsLock(marketID, isLocked) {
	return (dispatch) => {
		dispatch({ type: UPDATE_SELL_COMPLETE_SETS_LOCK, marketID, isLocked });
	};
}

export function marketConvertToTransactions(label, data, marketID) {
	return (dispatch, getState) => {
		const { marketsData, outcomesData, transactionsData } = getState();
		let outcomeID;
		let trade;
		let numTrades;
		let outcomeName;
		let marketType;
		let marketOutcomesData;
		const outcomeIDs = Object.keys(data[marketID]);
		const numOutcomes = outcomeIDs.length;
		if (marketsData[marketID]) {
			const description = marketsData[marketID].description;
			for (let j = 0; j < numOutcomes; ++j) {
				outcomeID = outcomeIDs[j];
				numTrades = data[marketID][outcomeID].length;
				marketOutcomesData = outcomesData[marketID];
				if (numTrades) {
					for (let k = 0; k < numTrades; ++k) {
						trade = data[marketID][outcomeID][k];
						marketType = marketsData[marketID] && marketsData[marketID].type;
						if (marketType === BINARY || marketType === SCALAR) {
							outcomeName = null;
						} else {
							outcomeName = (marketOutcomesData ? marketOutcomesData[outcomeID] : {}).name;
						}
						let utd = {};
						switch (label) {
							case 'log_fill_tx': {
								const hash = trade.transactionHash;
								const type = trade.type === 1 ? 'buy' : 'sell';
								const perfectType = trade.type === 1 ? 'bought' : 'sold';
								const price = formatEther(trade.price);
								const shares = formatShares(trade.shares);
								const bnPrice = abi.bignum(trade.price);
								let tradingFees = abi.bignum(trade.takerFee);
								let bnShares = abi.bignum(trade.shares);
								let totalCost = bnPrice.times(bnShares).plus(tradingFees);
								let totalReturn = bnPrice.times(bnShares).minus(tradingFees);
								let rawPrice;
								if (transactionsData[hash]) {
									tradingFees = tradingFees.plus(transactionsData[hash].rawTradingFees);
									bnShares = bnShares.plus(transactionsData[hash].rawNumShares);
									totalCost = totalCost.plus(transactionsData[hash].rawTotalCost);
									totalReturn = totalReturn.plus(transactionsData[hash].rawTotalReturn);
									rawPrice = bnPrice.times(abi.bignum(trade.shares)).plus(transactionsData[hash].rawPrice.times(transactionsData[hash].rawNumShares)).dividedBy(bnShares);
								}
								const totalCostPerShare = totalCost.dividedBy(bnShares);
								const totalReturnPerShare = totalReturn.dividedBy(bnShares);
								rawPrice = bnPrice;
								utd = {
									[hash]: {
										type,
										hash,
										status: SUCCESS,
										data: {
											marketDescription: description,
											marketType: marketsData[marketID].type,
											outcomeName: outcomeName || outcomeID,
											outcomeID,
											marketLink: selectMarketLink({ id: marketID, description }, dispatch)
										},
										message: `${perfectType} ${shares.full} for ${formatEther(trade.type === 1 ? totalCostPerShare : totalReturnPerShare).full} / share`,
										rawNumShares: bnShares,
										numShares: shares,
										rawPrice,
										noFeePrice: price,
										avgPrice: price,
										timestamp: formatDate(new Date(trade.timestamp * 1000)),
										rawTradingFees: tradingFees,
										tradingFees: formatEther(tradingFees),
										feePercent: formatPercent(tradingFees.dividedBy(totalCost).times(100)),
										rawTotalCost: totalCost,
										rawTotalReturn: totalReturn,
										totalCost: trade.type === 1 ? formatEther(totalCost) : undefined,
										totalReturn: trade.type === 2 ? formatEther(totalReturn) : undefined
									}
								};
								if (marketID === '0x2975c2448e19eabb0cb92620542e13bb581f64b1a5995b00ae044284a1b95084') {
									console.log('TRADE:', JSON.stringify(trade, null, 2));
									console.log('UTD:', JSON.stringify(utd, null, 2));
								}
								break;
							}
							case 'log_add_tx': {
								const type = trade.type === 'buy' ? 'bid' : 'ask';
								const price = formatEther(trade.price);
								const shares = formatShares(trade.amount);
								const makerFee = marketsData[marketID].makerFee;
								const takerFee = marketsData[marketID].takerFee;
								const maxValue = abi.bignum(marketsData[marketID].maxValue);
								const minValue = abi.bignum(marketsData[marketID].minValue);
								const fees = augur.calculateFxpTradingFees(makerFee, takerFee);
								const adjustedFees = augur.calculateFxpMakerTakerFees(
									augur.calculateFxpAdjustedTradingFee(
										fees.tradingFee,
										abi.fix(trade.price),
										abi.fix(maxValue.minus(minValue))
									),
									fees.makerProportionOfFee,
									false,
									true
								);
								const fxpShares = abi.fix(trade.amount);
								const fxpPrice = abi.fix(trade.price);
								const tradingFees = adjustedFees.maker.times(fxpShares)
									.dividedBy(constants.ONE)
									.floor()
									.times(fxpPrice)
									.dividedBy(constants.ONE)
									.floor();
								const noFeeCost = fxpPrice.times(fxpShares)
									.dividedBy(constants.ONE)
									.floor();
								const totalCost = noFeeCost.plus(tradingFees);
								const totalCostPerShare = totalCost.dividedBy(fxpShares)
									.times(constants.ONE)
									.floor();
								const totalReturn = fxpPrice.times(fxpShares)
									.dividedBy(constants.ONE)
									.floor()
									.minus(tradingFees);
								const totalReturnPerShare = totalReturn.dividedBy(fxpShares)
									.times(constants.ONE)
									.floor();
								utd = {
									[trade.transactionHash]: {
										type,
										status: SUCCESS,
										data: {
											marketDescription: description,
											marketType: marketsData[marketID].type,
											outcomeName: outcomeName || outcomeID,
											outcomeID,
											marketLink: selectMarketLink({ id: marketID, description }, dispatch)
										},
										message: `${type} ${shares.full} for ${formatEther(abi.unfix(trade.type === 'buy' ? totalCostPerShare : totalReturnPerShare)).full} / share`,
										numShares: shares,
										noFeePrice: price,
										freeze: {
											verb: 'froze',
											noFeeCost: trade.type === 'buy' ? formatEther(abi.unfix(noFeeCost)) : undefined,
											tradingFees: formatEther(abi.unfix(tradingFees))
										},
										avgPrice: price,
										timestamp: formatDate(new Date(trade.timestamp * 1000)),
										hash: trade.transactionHash,
										tradingFees: formatEther(abi.unfix(tradingFees)),
										feePercent: formatPercent(abi.unfix(tradingFees.dividedBy(totalCost).times(constants.ONE).floor()).times(100)),
										totalCost: trade.type === 'buy' ? formatEther(abi.unfix(totalCost)) : undefined,
										totalReturn: trade.type === 'sell' ? formatEther(abi.unfix(totalReturn)) : undefined
									}
								};
								break;
							}
							case 'log_cancel': {
								const price = formatEther(trade.price);
								const shares = formatShares(trade.amount);
								utd = {
									[trade.transactionHash]: {
										type: 'cancel_order',
										status: SUCCESS,
										data: {
											order: { type: trade.type, shares },
											marketDescription: description,
											marketType: marketsData[marketID] && marketsData[marketID].type,
											outcome: { name: outcomeName || outcomeID },
											outcomeID,
											marketLink: selectMarketLink({ id: marketID, description }, dispatch)
										},
										message: `canceled order to ${trade.type} ${shares.full} for ${price.full} each`,
										numShares: shares,
										noFeePrice: price,
										avgPrice: price,
										timestamp: formatDate(new Date(trade.timestamp * 1000)),
										hash: trade.transactionHash,
										totalReturn: formatEther(trade.cashRefund)
									}
								};
								break;
							}
							default:
								break;
						}
						dispatch(updateTransactionsData(utd));
					}
				}
			}
		}
	};
}

export function convertToTransactions(label, data, marketID) {
	return (dispatch, getState) => {
		console.log('convertToTransactions', label);
		console.log('data:', data);
		console.log('marketID:', marketID);
		const { marketsData } = getState();
		const marketIDs = Object.keys(data);
		const numMarkets = marketIDs.length;
		for (let i = 0; i < numMarkets; ++i) {
			if (marketsData[marketIDs[i]]) {
				dispatch(marketConvertToTransactions(label, data, marketIDs[i]));
			}
			dispatch(loadMarketsInfo([marketIDs[i]], () => {
				dispatch(marketConvertToTransactions(label, data, marketIDs[i]));
			}));
		}
	};
}

export function updateAccountBidsAsksData(data, marketID) {
	return (dispatch, getState) => {
		dispatch(convertToTransactions('log_add_tx', data, marketID));
	};
}

export function updateAccountCancelsData(data, marketID) {
	return (dispatch, getState) => {
		dispatch(convertToTransactions('log_cancel', data, marketID));
	};
}

export function updateAccountTradesData(data, marketID) {
	return (dispatch, getState) => {
		dispatch(convertToTransactions('log_fill_tx', data, marketID));
		dispatch({ type: UPDATE_ACCOUNT_TRADES_DATA, data, marketID });
	};
}

export function updateAccountPositionsData(data, marketID) {
	return (dispatch) => {
		dispatch({ type: UPDATE_ACCOUNT_POSITIONS_DATA, data, marketID });
	};
}

export function updateNetEffectiveTradesData(data, marketID) {
	return (dispatch) => {
		dispatch({ type: UPDATE_NET_EFFECTIVE_TRADES_DATA, data, marketID });
	};
}

export function updateCompleteSetsBought(data, marketID) {
	return (dispatch) => {
		dispatch({ type: UPDATE_COMPLETE_SETS_BOUGHT, data, marketID });
	};
}
