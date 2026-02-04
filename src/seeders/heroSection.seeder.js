import { HeroSection } from '../models/index.js';

export const seedHeroSection = async () => {
    try {
        const existingHeroSection = await HeroSection.findOne({});
        if (existingHeroSection) {
            // Hero section already exists, no need to seed
            return;
        }

        const heroSectionData = {
            title1: 'The Future of',
            title2: 'Point of Sale',
            subtitle:
                'Transform your business with our cloud-based POS system. Simplify your operations, track inventory in real time, and deliver a seamless checkout experience, all from one powerful platform.',
            heroImage:
                'https://res.cloudinary.com/diguqrxnk/video/upload/v1763533566/heroImages/1763533522948-toast-h1-2025-broll.mp4',
        };

        await HeroSection.create(heroSectionData);
        console.log('Hero section seeded successfully');
    } catch (error) {
        console.error('Error seeding hero section:', error);
    }
};
