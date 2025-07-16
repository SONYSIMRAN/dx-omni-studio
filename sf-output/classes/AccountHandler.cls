public class AccountHandler {
public static void beforeInsert(List<Account> newAccounts) {
        for (Account acc : newAccounts) {
            if (String.isBlank(acc.Description)) {
                acc.Description = 'Auto-generated description';
            }
        }
    }
}