import SuggestedQuestion from '../models/SuggestedQuestion.js';

class SuggestedQuestionController {
  /**
   * Get all suggested questions (public endpoint for widget)
   */
  static async getAll(req, res) {
    try {
      const questions = await SuggestedQuestion.find({ isActive: true })
        .sort({ order: 1 })
        .select('question answer order');

      return res.status(200).json({
        success: true,
        data: questions,
      });
    } catch (error) {
      console.error('Error fetching suggested questions:', error);
      return res.status(500).json({
        success: false,
        message: 'Error fetching suggested questions',
        error: error.message,
      });
    }
  }

  /**
   * Get all suggested questions for admin (including inactive)
   */
  static async getAllAdmin(req, res) {
    try {
      const questions = await SuggestedQuestion.find()
        .sort({ order: 1 });

      return res.status(200).json({
        success: true,
        data: questions,
      });
    } catch (error) {
      console.error('Error fetching suggested questions:', error);
      return res.status(500).json({
        success: false,
        message: 'Error fetching suggested questions',
        error: error.message,
      });
    }
  }

  /**
   * Create a new suggested question
   */
  static async create(req, res) {
    try {
      const { question, answer, order, isActive } = req.body;

      if (!question || !question.trim()) {
        return res.status(400).json({
          success: false,
          message: 'Question is required',
        });
      }

      if (!answer || !answer.trim()) {
        return res.status(400).json({
          success: false,
          message: 'Answer is required',
        });
      }

      // Get the highest order number and increment
      const maxOrder = await SuggestedQuestion.findOne().sort({ order: -1 }).select('order');
      const newOrder = order !== undefined ? order : (maxOrder?.order ?? 0) + 1;

      const newQuestion = await SuggestedQuestion.create({
        question: question.trim(),
        answer: answer.trim(),
        order: newOrder,
        isActive: isActive !== undefined ? isActive : true,
      });

      return res.status(201).json({
        success: true,
        message: 'Suggested question created successfully',
        data: newQuestion,
      });
    } catch (error) {
      console.error('Error creating suggested question:', error);
      return res.status(500).json({
        success: false,
        message: 'Error creating suggested question',
        error: error.message,
      });
    }
  }

  /**
   * Update a suggested question
   */
  static async update(req, res) {
    try {
      const { id } = req.params;
      const { question, answer, order, isActive } = req.body;

      const existingQuestion = await SuggestedQuestion.findById(id);
      if (!existingQuestion) {
        return res.status(404).json({
          success: false,
          message: 'Suggested question not found',
        });
      }

      if (question !== undefined) existingQuestion.question = question.trim();
      if (answer !== undefined) existingQuestion.answer = answer.trim();
      if (order !== undefined) existingQuestion.order = order;
      if (isActive !== undefined) existingQuestion.isActive = isActive;

      await existingQuestion.save();

      return res.status(200).json({
        success: true,
        message: 'Suggested question updated successfully',
        data: existingQuestion,
      });
    } catch (error) {
      console.error('Error updating suggested question:', error);
      return res.status(500).json({
        success: false,
        message: 'Error updating suggested question',
        error: error.message,
      });
    }
  }

  /**
   * Delete a suggested question
   */
  static async delete(req, res) {
    try {
      const { id } = req.params;

      const question = await SuggestedQuestion.findById(id);
      if (!question) {
        return res.status(404).json({
          success: false,
          message: 'Suggested question not found',
        });
      }

      await SuggestedQuestion.findByIdAndDelete(id);

      return res.status(200).json({
        success: true,
        message: 'Suggested question deleted successfully',
      });
    } catch (error) {
      console.error('Error deleting suggested question:', error);
      return res.status(500).json({
        success: false,
        message: 'Error deleting suggested question',
        error: error.message,
      });
    }
  }

  /**
   * Reorder suggested questions
   */
  static async reorder(req, res) {
    try {
      const { questions } = req.body; // Array of { id, order }

      if (!Array.isArray(questions)) {
        return res.status(400).json({
          success: false,
          message: 'Questions array is required',
        });
      }

      // Update all orders
      const updatePromises = questions.map(({ id, order }) =>
        SuggestedQuestion.findByIdAndUpdate(id, { order })
      );

      await Promise.all(updatePromises);

      return res.status(200).json({
        success: true,
        message: 'Questions reordered successfully',
      });
    } catch (error) {
      console.error('Error reordering questions:', error);
      return res.status(500).json({
        success: false,
        message: 'Error reordering questions',
        error: error.message,
      });
    }
  }

  /**
   * Seed default suggested questions
   */
  static async seedDefault(req, res) {
    try {
      // Check if questions already exist
      const existingCount = await SuggestedQuestion.countDocuments();
      if (existingCount > 0) {
        return res.status(400).json({
          success: false,
          message: 'Suggested questions already exist',
        });
      }

      const defaultQuestions = [
        {
          question: 'What is a POS system?',
          answer: 'A POS system is software used to process sales transactions and manage business operations.',
          order: 1,
        },
        {
          question: 'What are the key features?',
          answer: 'Key features include billing, inventory management, reporting, customer management, and barcode scanning.',
          order: 2,
        },
        {
          question: 'What payment methods are supported?',
          answer: 'We support cash, cards, UPI, and digital wallets. Payment gateways can be integrated easily.',
          order: 3,
        },
        {
          question: 'Can I manage inventory?',
          answer: 'Yes, you can track, update, and manage stock easily. The system sends low-stock alerts automatically.',
          order: 4,
        },
        {
          question: 'Is the POS system cloud-based?',
          answer: 'Yes, data is stored securely in the cloud with daily automatic backups.',
          order: 5,
        },
        {
          question: 'Does it support barcode scanning?',
          answer: 'Yes, barcode scanners are supported for quick billing and inventory management.',
          order: 6,
        },
      ];

      await SuggestedQuestion.insertMany(defaultQuestions);

      return res.status(201).json({
        success: true,
        message: 'Default suggested questions created successfully',
        data: defaultQuestions,
      });
    } catch (error) {
      console.error('Error seeding default questions:', error);
      return res.status(500).json({
        success: false,
        message: 'Error seeding default questions',
        error: error.message,
      });
    }
  }
}

export default SuggestedQuestionController;

