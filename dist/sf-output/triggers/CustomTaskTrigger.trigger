trigger CustomTaskTrigger on Task (after insert) {
if (Trigger.isAfter && Trigger.isInsert) {
        CustomTaskHandler.afterInsert(Trigger.new);
    }
}