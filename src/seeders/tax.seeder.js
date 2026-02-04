import { Tax } from '../models/index.js';

export const seedTaxes = async () => {
    try {
        const existingTaxes = await Tax.countDocuments();
        if (existingTaxes > 0) {
            return;
        }

        const taxes = [
            {
                _id: '6916b15331f25b1d92b68aef',
                name: 'GST',
                type: 'Fixed',
                value: 10,
                status: false,
                isDeleted: true,
                deletedAt: new Date('2025-11-14T07:31:11.793Z'),
                createdAt: new Date('2025-11-14T04:34:27.844Z'),
                updatedAt: new Date('2025-11-14T07:31:11.794Z'),
                __v: 0,
            },
            {
                _id: '6916b15331f25b1d92b68af0',
                name: 'VAT',
                type: 'Percentage',
                value: 5,
                status: true,
                isDeleted: false,
                deletedAt: null,
            },
            {
                _id: '6916b15331f25b1d92b68af1',
                name: 'Service Tax',
                type: 'Percentage',
                value: 12,
                status: true,
                isDeleted: false,
                deletedAt: null,
            },
            {
                _id: '6916b15331f25b1d92b68af2',
                name: 'Export Duty',
                type: 'Fixed',
                value: 100,
                status: true,
                isDeleted: false,
                deletedAt: null,
            },
        ];

        await Tax.insertMany(taxes);
        console.log('Taxes seeded successfully');
    } catch (error) {
        console.error('Error seeding taxes:', error);
    }
};
