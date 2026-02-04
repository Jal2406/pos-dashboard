import { Faq } from '../models/index.js';

export const seedFaqs = async () => {
    try {
        const existingFaqs = await Faq.countDocuments();
        if (existingFaqs > 0) {
            return;
        }

        const faqs = [
            {
                _id: '69313205b03c60655b80c030',
                question: 'Can I use the POS on multiple devices?',
                answer: 'Yes, your account can be accessed on multiple authorized devices.',
                categoryId: '69312a0c5a1b218d7046fad8',
                isPublished: true,
                slug: 'can-i-use-the-pos-on-multiple-devices',
            },
            {
                _id: '693131e8b03c60655b80c006',
                question: 'Is internet required to use the POS?',
                answer: 'Internet is required for syncing, but offline sales are supported.',
                categoryId: '69312a0c5a1b218d7046fad8',
                isPublished: true,
                slug: 'is-internet-required-to-use-the-pos',
            },
            {
                _id: '693131a2b03c60655b80bfdc',
                question: 'What should I do if a payment fails?',
                answer: 'You can retry the payment or switch to another payment method.',
                categoryId: '69312a1c5a1b218d7046fadf',
                isPublished: true,
                slug: 'what-should-i-do-if-a-payment-fails',
            },
            {
                _id: '69313187b03c60655b80bfb2',
                question: 'How do I cancel or void a sale?',
                answer: 'Sales can be voided from the transaction history with proper permission.',
                categoryId: '69312a1c5a1b218d7046fadf',
                isPublished: true,
                slug: 'how-do-i-cancel-or-void-a-sale',
            },
            {
                _id: '6931316db03c60655b80bf88',
                question: 'Can I hold and resume a bill?',
                answer: 'Yes, you can hold a bill and resume it later from the Hold Orders list.',
                categoryId: '69312a1c5a1b218d7046fadf',
                isPublished: true,
                slug: 'can-i-hold-and-resume-a-bill',
            },
            {
                _id: '6931312db03c60655b80bf1a',
                question: 'What payment methods are supported?',
                answer: 'Cash, Card, UPI, Wallets, and Split Payments are supported.',
                categoryId: '69312a1c5a1b218d7046fadf',
                isPublished: true,
                slug: 'what-payment-methods-are-supported',
            },
            {
                _id: '69313053b03c60655b80becc',
                question: 'How do I update stock manually?',
                answer: 'Use the Stock Adjustment option to increase or decrease inventory.',
                categoryId: '69312a2a5a1b218d7046fae3',
                isPublished: true,
                slug: 'how-do-i-update-stock-manually',
            },
            {
                _id: '69313036b03c60655b80bea2',
                question: 'Can I import products in bulk?',
                answer: 'Yes, you can upload products using Excel or CSV files.',
                categoryId: '69312a2a5a1b218d7046fae3',
                isPublished: true,
                slug: 'can-i-import-products-in-bulk',
            },
            {
                _id: '69313015b03c60655b80be69',
                question: 'How do I add a new product?',
                answer: 'Go to Products, click Add Product, and enter name, price, stock, and barcode.',
                categoryId: '69312a2a5a1b218d7046fae3',
                isPublished: true,
                slug: 'how-do-i-add-a-new-product',
            },
            {
                _id: '69312fd0b03c60655b80be3f',
                question: 'Can I track customer purchase history?',
                answer: 'Yes, full transaction history is available under each customer profile.',
                categoryId: '69312a495a1b218d7046fae7',
                isPublished: true,
                slug: 'can-i-track-customer-purchase-history',
            },
            {
                _id: '69312bfc5a1b218d7046fcbb',
                question: 'How does the loyalty points system work?',
                answer: 'Customers earn points on each purchase, which can be redeemed on future bills.',
                categoryId: '69312a495a1b218d7046fae7',
                isPublished: true,
                slug: 'how-does-the-loyalty-points-system-work',
            },
            {
                _id: '69312bd25a1b218d7046fc8f',
                question: 'Can I offer different discounts to different customers?',
                answer: 'Yes, you can assign special pricing or discounts to customer groups.',
                categoryId: '69312a495a1b218d7046fae7',
                isPublished: true,
                slug: 'can-i-offer-different-discounts-to-different-customers',
            },
            {
                _id: '69312bae5a1b218d7046fc02',
                question: 'How do I add a new customer?',
                answer: 'You can add customers from the Customers section by entering name, mobile number, and optional email.',
                categoryId: '69312a495a1b218d7046fae7',
                isPublished: true,
                slug: 'how-do-i-add-a-new-customer',
            },
        ];

        await Faq.insertMany(faqs);
        console.log('FAQs seeded successfully');
    } catch (error) {
        console.error('Error seeding FAQs:', error);
    }
};
