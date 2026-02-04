import { FooterSection } from '../models/index.js';

export const seedFooterSection = async () => {
    try {
        const existingFooter = await FooterSection.findOne();
        if (existingFooter) {
            return;
        }

        const footerData = {
            _id: '6932c706def20d19ac2775a2',
            footer: {
                cta: {
                    title: "Ready to Transform Your Business?",
                    subtitle: "Join thousands of successful businesses using POSPro. Start your free trial today and experience the difference a modern POS system can ui macke."
                },
                links: [
                    {
                        _id: '6932c706def20d19ac2775a3',
                        title: "Terms and Conditions",
                        description: `<p data-pm-slice="0 0 []"><strong>&lt;h1&gt;Terms and Conditions&lt;/h1&gt;</strong></p>
<p>&lt;p&gt;Welcome to our platform. These &lt;strong&gt;Terms and Conditions&lt;/strong&gt; govern your access to and use of our website, software, and services. By accessing or using our services, you agree to be bound by these terms.&lt;/p&gt;</p>
<p>&lt;h2&gt;1. User Eligibility&lt;/h2&gt;</p>
<p>&lt;p&gt;You must be at least &lt;strong&gt;18 years of age&lt;/strong&gt; to use our services. By using our platform, you confirm that you are legally capable of entering into a binding agreement.&lt;/p&gt;</p>
<p>&lt;h2&gt;2. Account Responsibilities&lt;/h2&gt;</p>
<p>&lt;p&gt;When you create an account, you agree to:&lt;/p&gt;</p>
<p>&lt;ul&gt;</p>
<p>&lt;li&gt;Provide accurate and complete information&lt;/li&gt;</p>
<p>&lt;li&gt;Maintain the confidentiality of your login credentials&lt;/li&gt;</p>
<p>&lt;li&gt;Accept responsibility for all activities under your account&lt;/li&gt;</p>
<p>&lt;/ul&gt;</p>
<p>&nbsp;</p>
<p>&lt;h2&gt;3. Acceptable Use&lt;/h2&gt;</p>
<p>&lt;p&gt;You agree &lt;em&gt;not&lt;/em&gt; to misuse the platform. Prohibited activities include, but are not limited to:&lt;/p&gt;</p>
<p>&lt;ul&gt;</p>
<p>&lt;li&gt;Unauthorized access to systems&lt;/li&gt;</p>
<p>&lt;li&gt;Data scraping or automation abuse&lt;/li&gt;</p>
<p>&lt;li&gt;Distribution of harmful or illegal content&lt;/li&gt;</p>
<p>&lt;/ul&gt;</p>
<p>&nbsp;</p>
<p>&lt;h2&gt;4. Subscription and Payments&lt;/h2&gt;</p>
<p>&lt;p&gt;All paid services are billed based on the plan selected. Payments are &lt;strong&gt;non-refundable&lt;/strong&gt; unless otherwise stated in writing.&lt;/p&gt;</p>
<p>&nbsp;</p>
<p>&lt;h2&gt;5. Intellectual Property&lt;/h2&gt;</p>
<p>&lt;p&gt;All content, logos, software, and designs are the exclusive property of the company and are protected under applicable copyright and trademark laws.&lt;/p&gt;</p>
<p>&nbsp;</p>
<p>&lt;blockquote&gt;</p>
<p>Unauthorized use of our intellectual property may result in legal action.</p>
<p>&lt;/blockquote&gt;</p>
<p>&nbsp;</p>
<p>&lt;h2&gt;6. Data Privacy&lt;/h2&gt;</p>
<p>&lt;p&gt;Your use of the platform is also governed by our &lt;a href="#"&gt;Privacy Policy&lt;/a&gt;. We are committed to protecting your personal information and using it responsibly.&lt;/p&gt;</p>
<p>&nbsp;</p>
<p>&lt;h2&gt;7. Service Availability&lt;/h2&gt;</p>
<p>&lt;p&gt;We aim to maintain maximum uptime; however, we do not guarantee uninterrupted service. Scheduled maintenance or unexpected outages may occur.&lt;/p&gt;</p>
<p>&nbsp;</p>
<p>&lt;h2&gt;8. Limitation of Liability&lt;/h2&gt;</p>
<p>&lt;p&gt;Under no circumstances shall the company be liable for any indirect, incidental, or consequential damages arising from your use of the service.&lt;/p&gt;</p>
<p>&nbsp;</p>
<p>&lt;h2&gt;9. Termination&lt;/h2&gt;</p>
<p>&lt;p&gt;We reserve the right to suspend or terminate your account without prior notice if we determine a violation of these terms has occurred.&lt;/p&gt;</p>
<p>&nbsp;</p>
<p>&lt;h2&gt;10. Third-Party Services&lt;/h2&gt;</p>
<p>&lt;p&gt;Our platform may integrate with third-party tools. We are not responsible for the content, policies, or practices of any third-party services.&lt;/p&gt;</p>
<p>&nbsp;</p>
<p>&lt;h2&gt;11. Modifications to Terms&lt;/h2&gt;</p>
<p>&lt;p&gt;We may update these terms at any time. Continued use of the service after changes implies acceptance of the revised Terms and Conditions.&lt;/p&gt;</p>
<p>&nbsp;</p>
<p>&lt;h2&gt;12. Governing Law&lt;/h2&gt;</p>
<p>&lt;p&gt;These terms shall be governed by and interpreted in accordance with the laws applicable in your operating jurisdiction.&lt;/p&gt;</p>
<p>&nbsp;</p>
<p>&lt;h2&gt;13. Contact Information&lt;/h2&gt;</p>
<p>&lt;p&gt;If you have any questions about these Terms and Conditions, please contact our support team through the official communication channels provided on our website.&lt;/p&gt;</p>
<p>&nbsp;</p>
<p>&lt;p&gt;&lt;strong&gt;Last Updated:&lt;/strong&gt; [Insert Date]&lt;/p&gt;</p>`,
                        status: true,
                    }
                ]
            },
            createdAt: new Date("2025-12-05T11:50:30.620Z"),
            updatedAt: new Date("2025-12-08T07:26:37.919Z")
        };

        await FooterSection.create(footerData);
        console.log('Footer Section seeded successfully');
    } catch (error) {
        console.error('Error seeding Footer Section:', error);
    }
};
