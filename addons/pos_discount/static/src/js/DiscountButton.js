/** @odoo-module */

import PosComponent from "@point_of_sale/js/PosComponent";
import ProductScreen from "@point_of_sale/js/Screens/ProductScreen/ProductScreen";
import { useListener } from "@web/core/utils/hooks";
import Registries from "@point_of_sale/js/Registries";

class DiscountButton extends PosComponent {
    setup() {
        super.setup();
        useListener("click", this.onClick);
    }
    async onClick() {
        var self = this;
        const { confirmed, payload } = await this.showPopup("NumberPopup", {
            title: this.env._t("Discount Percentage"),
            startingValue: this.env.pos.config.discount_pc,
            isInputSelected: true,
        });
        if (confirmed) {
            const val = Math.max(0, Math.min(100, parseFloat(payload)));
            await self.apply_discount(val);
        }
    }

    async apply_discount(pc) {
        var order = this.env.pos.get_order();
        var lines = order.get_orderlines();
        var product = this.env.pos.db.get_product_by_id(this.env.pos.config.discount_product_id[0]);
        if (product === undefined) {
            await this.showPopup("ErrorPopup", {
                title: this.env._t("No discount product found"),
                body: this.env._t(
                    "The discount product seems misconfigured. Make sure it is flagged as 'Can be Sold' and 'Available in Point of Sale'."
                ),
            });
            return;
        }

        // Remove existing discounts
        lines
            .filter((line) => line.get_product() === product)
            .forEach((line) => order.remove_orderline(line));

        // Add one discount line per tax group
        const linesByTax = order.get_orderlines_grouped_by_tax_ids();
        for (const [tax_ids, lines] of Object.entries(linesByTax)) {
            // Note that tax_ids_array is an Array of tax_ids that apply to these lines
            // That is, the use case of products with more than one tax is supported.
            const tax_ids_array = tax_ids
                .split(",")
                .filter((id) => id !== "")
                .map((id) => Number(id));

            const baseToDiscount = order.calculate_base_amount(
                tax_ids_array,
                lines.filter((ll) => ll.isGlobalDiscountApplicable())
            );

            // We add the price as manually set to avoid recomputation when changing customer.
            const discount = (-pc / 100.0) * baseToDiscount;
            if (discount < 0) {
                order.add_product(product, {
                    price: discount,
                    lst_price: discount,
                    tax_ids: tax_ids_array,
                    merge: false,
                    description:
                        `${pc}%, ` +
                        (tax_ids_array.length
                            ? _.str.sprintf(
                                  this.env._t("Tax: %s"),
                                  tax_ids_array
                                      .map((taxId) => this.env.pos.taxes_by_id[taxId].amount + "%")
                                      .join(", ")
                              )
                            : this.env._t("No tax")),
                    extras: {
                        price_automatically_set: true,
                    },
                });
            }
        }
    }
}
DiscountButton.template = "DiscountButton";

ProductScreen.addControlButton({
    component: DiscountButton,
    condition: function () {
        return this.env.pos.config.module_pos_discount && this.env.pos.config.discount_product_id;
    },
});

Registries.Component.add(DiscountButton);

export default DiscountButton;
