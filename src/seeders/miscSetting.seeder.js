import { MiscSetting } from '../models/index.js';

export const seedMiscSettings = async () => {
    try {
        const existingSettings = await MiscSetting.findOne({});
        if (existingSettings) {
            // Settings already exist, no need to seed
            return;
        }

        const miscSettingData = {
            darkMode: true,
            timeZone: 'India Standard Time',
            UTC: '+05:30',
            isMaintenanceMode: false,
            dateFormat: 'DD/MM/YYYY',
            timeFormat: '12',
        };

        await MiscSetting.create(miscSettingData);
        console.log('Misc settings seeded successfully');
    } catch (error) {
        console.error('Error seeding misc settings:', error);
    }
};
