public class ProductHandler {
public static void beforeUpdate(List<Product2> products) {
        for (Product2 p : products) {
            if (p.IsActive == false) {
                p.Description = 'Product is now inactive';
            }
        }
    }
}