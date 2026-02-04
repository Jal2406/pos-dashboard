import { SocialMediaLinks } from '../models/index.js';

export const seedSocialMediaLinks = async () => {
    try {
        const existingLinks = await SocialMediaLinks.countDocuments();
        if (existingLinks > 0) {
            return;
        }

        const socialMediaLinksData = {
            _id: '6937c514a0137b91e1a05ada',
            InstagramLink: 'https://www.instagram.com/buildxpria/',
            FacebookLink: 'https://www.facebook.com/buildxpria/',
            TwitterLink: 'https://www.twitter.com/buildxpria/',
            LinkedInLink: '',
            YoutubeLink: 'https://www.youtube.com/buildxpria/',
            createdAt: new Date('2025-12-09T06:43:32.068Z'),
            updatedAt: new Date('2025-12-09T06:43:32.068Z'),
        };

        await SocialMediaLinks.create(socialMediaLinksData);
        console.log('Social Media Links seeded successfully');
    } catch (error) {
        console.error('Error seeding Social Media Links:', error);
    }
};
