public class CaseHandler {
public static void afterUpdate(List<Case> cases) {
        for (Case c : cases) {
            System.debug('Case updated: ' + c.Subject);
        }
    }
}