public class AccountHelper {
public static void createDummyAccount(String accName) {
        Account acc = new Account(Name = accName);
        insert acc;
    }

    public static List<Account> getAllAccounts() {
        return [SELECT Id, Name FROM Account];
    }
}