public with sharing class CreateCaseHandler {
    @InvocableMethod(label='Create Case')
    public static List<Id> createCase(List<String> subjectList) {
        if (!Schema.sObjectType.Case.isCreateable()) {
            throw new System.SecurityException('User does not have create access to Case');
        }

        List<Case> cases = new List<Case>();
        for (String subj : subjectList) {
            cases.add(new Case(Subject=subj, Status='New'));
        }
        insert cases;

        List<Id> caseIds = new List<Id>();
        for (Case c : cases) {
            caseIds.add(c.Id);
        }
        return caseIds;
    }
}