trigger CaseTrigger on Case (after update) {
if (Trigger.isAfter && Trigger.isUpdate) {
        CaseHandler.afterUpdate(Trigger.new);
    }
}