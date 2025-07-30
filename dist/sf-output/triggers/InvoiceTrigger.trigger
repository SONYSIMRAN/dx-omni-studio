trigger InvoiceTrigger on Invoice__c (before insert, before update) {
    if (Trigger.isBefore && (Trigger.isInsert || Trigger.isUpdate)) {
        InvoiceHelper.updateStatus(Trigger.new);
    }
}