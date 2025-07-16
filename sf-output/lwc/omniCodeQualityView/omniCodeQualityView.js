import { LightningElement, api, wire } from 'lwc';
import getCodeQuality from '@salesforce/apex/OmniCodeQualityController.getCodeQuality';

export default class OmniCodeQualityView extends LightningElement {
    @api apexClassName = 'CreateCaseHandler';
    quality;
    error;

    @wire(getCodeQuality, { apexClassName: '$apexClassName' })
    wiredQuality({ error, data }) {
        if (data) {
            this.quality = data;
            this.error = undefined;
        } else if (error) {
            this.error = 'Failed to load code quality data';
            this.quality = undefined;
        }
    }
}