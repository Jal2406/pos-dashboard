import { FaqCategory } from '../models/index.js';

export const seedFaqCategories = async () => {
    try {
        const existingCategories = await FaqCategory.countDocuments();
        if (existingCategories > 0) {
            return;
        }

        const faqCategories = [
            {
                _id: '69312a495a1b218d7046fae7',
                categoryName: 'Customers, Discounts & Loyalty',
                status: true,
                isDeleted: false,
            },
            {
                _id: '69312a0c5a1b218d7046fad8',
                categoryName: 'General Category',
                status: true,
                isDeleted: false,
            },
            {
                _id: '69312a2a5a1b218d7046fae3',
                categoryName: 'Products & Inventory Management',
                status: true,
                isDeleted: false,
            },
            {
                _id: '69312a1c5a1b218d7046fadf',
                categoryName: 'Sales, Billing & Payments',
                status: true,
                isDeleted: false,
            },
        ];

        await FaqCategory.insertMany(faqCategories);
        console.log('FAQ Categories seeded successfully');
    } catch (error) {
        console.error('Error seeding FAQ Categories:', error);
    }
};
