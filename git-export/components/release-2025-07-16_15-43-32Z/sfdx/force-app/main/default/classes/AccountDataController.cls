public with sharing class AccountDataController {
    @AuraEnabled(cacheable=true)
    
    public static Account getAccountData(Id accountId) {
        return [SELECT Id, Name, Phone, Industry FROM Account WHERE Id = :accountId LIMIT 1];
    }
}