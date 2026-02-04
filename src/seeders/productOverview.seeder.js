import { ProductOverview } from '../models/index.js';

export const seedProductOverview = async () => {
    try {
        const existingOverviews = await ProductOverview.countDocuments();
        if (existingOverviews > 0) {
            return;
        }

        const overviews = [
            {
                _id: '694126fcfbf5f1bf51df21d4',
                title: 'Sales Dashboard',
                description: 'Track Daily, Weekly Track',
                overviewImage:
                    'https://res.cloudinary.com/diguqrxnk/image/upload/v1765877500/dashboardImages/1765877497978-simple-aesthetic-computer-dygjk0vs9rpyzshz.jpg',
                status: true,
            },
            {
                _id: '694126fcfbf5f1bf51df21d5',
                title: 'Smart Inventory',
                description:
                    'Real-time stock tracking and low inventory alerts to never run out of products.',
                overviewImage:
                    'https://res.cloudinary.com/diguqrxnk/image/upload/v1765877500/dashboardImages/1765877497978-simple-aesthetic-computer-dygjk0vs9rpyzshz.jpg',
                status: true,
            },
            {
                _id: '694126fcfbf5f1bf51df21d6',
                title: 'Customer Insights',
                description:
                    'Understand your customers better with detailed purchase history and behavioral analytics.',
                overviewImage:
                    'https://res.cloudinary.com/diguqrxnk/image/upload/v1765877500/dashboardImages/1765877497978-simple-aesthetic-computer-dygjk0vs9rpyzshz.jpg',
                status: true,
            },
            {
                _id: '694126fcfbf5f1bf51df21d7',
                title: 'Multi-Store Management',
                description:
                    'Manage multiple locations from a single admin panel with centralized reporting.',
                overviewImage:
                    'https://res.cloudinary.com/diguqrxnk/image/upload/v1765877500/dashboardImages/1765877497978-simple-aesthetic-computer-dygjk0vs9rpyzshz.jpg',
                status: true,
            },
            {
                _id: '694126fcfbf5f1bf51df21d8',
                title: 'Employee Management',
                description:
                    'Track employee attendance, performance, and manage roles and permissions efficiently.',
                overviewImage:
                    'https://res.cloudinary.com/diguqrxnk/image/upload/v1765877500/dashboardImages/1765877497978-simple-aesthetic-computer-dygjk0vs9rpyzshz.jpg',
                status: true,
            },
            {
                _id: '694126fcfbf5f1bf51df21d9',
                title: 'Financial Reports',
                description:
                    'Detailed financial reports including profit & loss, tax reports, and expense tracking.',
                overviewImage:
                    'https://res.cloudinary.com/diguqrxnk/image/upload/v1765877500/dashboardImages/1765877497978-simple-aesthetic-computer-dygjk0vs9rpyzshz.jpg',
                status: true,
            },
            {
                _id: '694126fcfbf5f1bf51df21da',
                title: 'Supplier Management',
                description:
                    'Manage supplier relationships, purchase orders, and track incoming shipments.',
                overviewImage:
                    'https://res.cloudinary.com/diguqrxnk/image/upload/v1765877500/dashboardImages/1765877497978-simple-aesthetic-computer-dygjk0vs9rpyzshz.jpg',
                status: true,
            },
            {
                _id: '694126fcfbf5f1bf51df21db',
                title: 'Loyalty Programs',
                description:
                    'Create and manage customer loyalty programs, points, and rewards to boost retention.',
                overviewImage:
                    'https://res.cloudinary.com/diguqrxnk/image/upload/v1765877500/dashboardImages/1765877497978-simple-aesthetic-computer-dygjk0vs9rpyzshz.jpg',
                status: true,
            },
        ];

        await ProductOverview.insertMany(overviews);
        console.log('Product Overview data seeded successfully');
    } catch (error) {
        console.error('Error seeding Product Overview data:', error);
    }
};
