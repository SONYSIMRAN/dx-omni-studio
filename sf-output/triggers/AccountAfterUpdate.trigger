trigger AccountAfterUpdate on Account (after update) {
for (Account acc : Trigger.new) {
        Account oldAcc = Trigger.oldMap.get(acc.Id);
        if (acc.Name != oldAcc.Name) {
            System.debug('Account name changed from ' + oldAcc.Name + ' to ' + acc.Name);
        }
    }
}