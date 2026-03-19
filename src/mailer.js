const nodemailer = require('nodemailer');

const transporter = nodemailer.createTransport({
  service: 'SendGrid',
  auth: {
    user: 'apikey', // This is literal 'apikey' for SendGrid
    pass: process.env.SENDGRID_API_KEY
  }
});

module.exports = transporter;
