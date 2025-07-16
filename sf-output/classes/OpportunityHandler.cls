public class OpportunityHandler {
public static void beforeUpdate(List<Opportunity> opps) {
        for (Opportunity opp : opps) {
            if (opp.StageName == 'Closed Won') {
                opp.Description = 'Congrats on the win!';
            }
        }
    }
}