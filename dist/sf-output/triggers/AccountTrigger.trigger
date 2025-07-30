trigger AccountTrigger on Account (before insert, after insert) {
if (Trigger.isBefore && Trigger.isInsert) {
        for (Account acc : Trigger.new) {
            acc.Description = 'Dummy Account created';
        }
    }

    if (Trigger.isAfter && Trigger.isInsert) {
        System.debug('Dummy accounts inserted: ' + Trigger.new);
    }
}