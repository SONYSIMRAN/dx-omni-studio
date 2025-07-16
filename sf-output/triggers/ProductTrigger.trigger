trigger ProductTrigger on Product2 (before update) {
if (Trigger.isBefore && Trigger.isUpdate) {
        ProductHandler.beforeUpdate(Trigger.new);
    }
}