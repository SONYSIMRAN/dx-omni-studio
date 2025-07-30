trigger LeadTrigger on Lead (before insert) {
if (Trigger.isBefore && Trigger.isInsert) {
        LeadHandler.beforeInsert(Trigger.new);
    }
}