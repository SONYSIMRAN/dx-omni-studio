trigger ContactTrigger on Contact (after insert) {
if (Trigger.isAfter && Trigger.isInsert) {
        ContactHandler.afterInsert(Trigger.new);
    }
}