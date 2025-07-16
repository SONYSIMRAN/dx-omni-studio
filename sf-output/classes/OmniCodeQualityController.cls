public with sharing class OmniCodeQualityController {
    @AuraEnabled(cacheable=true)
    public static Code_Quality_Result__c getCodeQuality(String apexClassName) {
        if (!Schema.SObjectType.Code_Quality_Result__c.isAccessible()) {
            throw new System.SecurityException('User does not have read access to Code_Quality_Result__c');
        }

        return [
            SELECT Apex_Class_Name__c, Bugs__c, Vulnerabilities__c, Code_Smells__c, Coverage__c
            FROM Code_Quality_Result__c
            WHERE Apex_Class_Name__c = :apexClassName
            LIMIT 1
        ];
    }
}