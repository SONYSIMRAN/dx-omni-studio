public class LeadHandler {
public static void beforeInsert(List<Lead> leads) {
        for (Lead l : leads) {
            if (String.isBlank(l.Company)) {
                l.Company = 'Default Company';
            }
        }
    }
}