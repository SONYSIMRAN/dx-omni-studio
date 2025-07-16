trigger OpportunityTrigger on Opportunity (before update) {
if (Trigger.isBefore && Trigger.isUpdate) {
        OpportunityHandler.beforeUpdate(Trigger.new);
    }
}