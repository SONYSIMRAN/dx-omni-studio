public class CustomTaskHandler {
public static void afterInsert(List<Task> tasks) {
        for (Task t : tasks) {
            System.debug('Task created with subject: ' + t.Subject);
        }
    }
}