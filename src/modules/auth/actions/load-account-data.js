// import { anyAccountBalancesZero } from 'modules/auth/selectors/balances';
import { loadAccountDataFromLocalStorage } from 'modules/auth/actions/load-account-data-from-local-storage';
import { loadRegisterBlockNumber } from 'modules/auth/actions/load-register-block-number';
import { updateAssets } from 'modules/auth/actions/update-assets';
import { updateLoginAccount } from 'modules/auth/actions/update-login-account';
import { displayTopicsPage } from 'modules/link/actions/display-topics-page';

export const loadAccountData = (account, redirect) => (dispatch, getState) => {
  if (!account || !account.address) return console.error('account address required');
  dispatch(loadAccountDataFromLocalStorage(account.address));
  dispatch(updateLoginAccount(account));
  dispatch(displayTopicsPage(redirect));
  dispatch(updateAssets((err, balances) => {
    if (err) return console.error(err);
    dispatch(loadRegisterBlockNumber());
  }));
};
