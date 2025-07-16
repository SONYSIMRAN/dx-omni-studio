public class InvoiceHelper {
    public static void updateStatus(List<Invoice__c> invoices) {
        for (Invoice__c inv : invoices) {
            if (inv.Amount__c != null && inv.Amount__c > 1000) {
                inv.Status__c = 'High Value';
            } else {
                inv.Status__c = 'Normal';
            }
        }
    }
}