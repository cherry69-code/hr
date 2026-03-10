const sendEmail = require('./sendEmail');

const EmailType = {
  OPERATIONAL: 'operational', // Leave, Attendance, Holiday, Payroll -> Official
  LEGAL: 'legal',             // Offer, Joining, Termination -> Personal
  CRITICAL: 'critical'        // Termination, Exit, F&F -> Both
};

/**
 * Routes email to the correct recipient based on type
 * @param {Object} user - User object containing email fields
 * @param {String} type - EmailType (OPERATIONAL, LEGAL, CRITICAL)
 * @param {Object} options - Standard sendEmail options (subject, text, html, attachments)
 */
const sendCategorizedEmail = async (user, type, options) => {
  let recipients = [];
  
  // Normalize emails
  const official = user.officialEmail || user.email; // Use primary email as official fallback
  const personal = user.personalEmail;

  if (type === EmailType.OPERATIONAL) {
    // 1. Official Email
    // 2. Fallback to Personal if Official not available (e.g. pre-joining)
    if (official) {
      recipients.push(official);
    } else if (personal) {
      recipients.push(personal);
    }
  } 
  else if (type === EmailType.LEGAL) {
    // 1. Personal Email (Primary for legal docs)
    // 2. Fallback to Official if Personal missing
    if (personal) {
      recipients.push(personal);
    } else if (official) {
      recipients.push(official);
    }
  } 
  else if (type === EmailType.CRITICAL) {
    // Send to BOTH Official and Personal
    if (official) recipients.push(official);
    if (personal) recipients.push(personal);
  } else {
    // Default to Official/Primary if type unknown
    if (official) recipients.push(official);
  }

  // Remove duplicates and empty values
  recipients = [...new Set(recipients.filter(e => e))];

  if (recipients.length === 0) {
    console.warn(`No valid email found for user ${user._id || user.name} for email type ${type}`);
    return;
  }

  console.log(`Sending ${type} email to:`, recipients);

  // Send email to each recipient
  // We return a promise that resolves when all are sent
  const promises = recipients.map(email => 
    sendEmail({ ...options, email })
  );

  return Promise.all(promises);
};

module.exports = { sendCategorizedEmail, EmailType };
