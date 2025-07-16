import { LightningElement, api } from 'lwc';
import getAccountData from '@salesforce/apex/AccountDataController.getAccountData';

export default class AccountDetailsDisplay extends LightningElement {
    @api AccountId;
    account;

    connectedCallback() {
        if (this.AccountId) {
            getAccountData({ accountId: this.AccountId })
                .then(result => {
                    this.account = result;
                })
                .catch(error => {
                    console.error('Error fetching account:', error);
                });
        }
    }
}