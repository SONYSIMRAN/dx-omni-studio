public class ContactHandler {
public static void afterInsert(List<Contact> contacts) {
        for (Contact con : contacts) {
            System.debug('New Contact Inserted: ' + con.Name);
        }
    }
}