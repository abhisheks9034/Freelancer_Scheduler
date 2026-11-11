import React from 'react';
import { Link } from 'react-router-dom';

const Section = ({ title, children }) => (
  <section className="glass-card p-6 md:p-8 border border-white/10">
    <h2 className="text-white font-bold text-lg md:text-xl mb-3 tracking-tight">{title}</h2>
    <div className="text-sm text-slate-300/90 leading-relaxed space-y-3">{children}</div>
  </section>
);

const PrivacyPolicy = () => {
  const lastUpdated = '2026-04-10';

  return (
    <div className="min-h-screen bg-dark-950 text-slate-200 font-syne">
      <div className="max-w-4xl mx-auto px-6 py-12 md:py-16">
        <div className="flex items-center justify-between gap-4 mb-10">
          <div className="min-w-0">
            <div className="text-xs font-black text-slate-500 uppercase tracking-widest mb-2">Legal</div>
            <h1 className="text-3xl md:text-4xl font-bold text-white tracking-tight truncate">Privacy Policy</h1>
            <p className="text-sm text-slate-400 mt-2">Last updated: {lastUpdated}</p>
          </div>
          <Link
            to="/"
            className="shrink-0 px-4 py-2 rounded-xl bg-white/5 border border-white/10 hover:bg-white/10 text-xs font-bold uppercase tracking-widest text-slate-200 transition-standard"
          >
            Back to home
          </Link>
        </div>

        <div className="space-y-5">
          <Section title="Summary">
            <p>
              FreelanceOS helps freelancers and clients schedule meetings, communicate, and receive booking notifications. We collect only the
              information needed to provide these features.
            </p>
          </Section>

          <Section title="Information we collect">
            <ul className="list-disc pl-5 space-y-2">
              <li><strong>Account data</strong>: name, email, role (freelancer/client), profile details you provide.</li>
              <li><strong>Booking data</strong>: availability slots, booking requests, confirmations, and related metadata.</li>
              <li><strong>Chat data</strong>: messages between matched client–freelancer pairs.</li>
              <li><strong>Google connection data</strong>: a Google refresh token (stored securely) if you connect Google for sending emails and calendar actions.</li>
            </ul>
          </Section>

          <Section title="How we use information">
            <ul className="list-disc pl-5 space-y-2">
              <li>To authenticate you and provide dashboards and settings.</li>
              <li>To create and manage availability and bookings.</li>
              <li>To enable real-time chat between matched users.</li>
              <li>To send booking-related emails and calendar invites when you connect Google.</li>
              <li>To maintain security, prevent abuse, and troubleshoot issues.</li>
            </ul>
          </Section>

          <Section title="Google API use (Gmail/Calendar)">
            <p>
              If you choose to connect your Google account, we request Google OAuth permissions to send booking emails and manage calendar events.
              We store a refresh token so you don’t need to reconnect every time. You can revoke access any time from your Google account settings.
            </p>
          </Section>

          <Section title="Sharing">
            <p>
              We do not sell your personal data. We share data only as required to provide core functionality (for example, sending an email to the
              other party for a booking), or if required by law.
            </p>
          </Section>

          <Section title="Security">
            <p>
              We use authentication and access controls to restrict access to bookings and chats. However, no method of transmission or storage is
              100% secure. If you believe your account is compromised, contact the developer immediately.
            </p>
          </Section>

          <Section title="Data retention">
            <p>
              We retain account, booking, and chat information as needed to provide the service. You may request deletion by contacting the
              developer.
            </p>
          </Section>

          <Section title="Contact">
            <p>
              For questions about this Privacy Policy, contact: <span className="text-slate-200 font-semibold">aykulshrestha7115@gmail.com</span>
            </p>
          </Section>
        </div>

        <div className="mt-10 text-xs text-slate-600 border-t border-white/5 pt-6 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
          <div>© {new Date().getFullYear()} FreelanceOS</div>
          <div className="flex items-center gap-4">
            <Link to="/privacy" className="hover:text-slate-400 transition-colors">Privacy</Link>
            <a href="mailto:aykulshrestha7115@gmail.com" className="hover:text-slate-400 transition-colors">Email</a>
          </div>
        </div>
      </div>
    </div>
  );
};

export default PrivacyPolicy;

