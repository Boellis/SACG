import { signOut } from 'firebase/auth';
import { auth } from '../lib/firebase';

const CONTACT_EMAIL = 'southatxgarden@gmail.com';

export default function PendingApproval() {
  const handleSignOut = () => {
    signOut(auth).catch(console.error);
  };

  return (
    <div className="min-h-screen bg-garden-50 flex items-center justify-center px-4">
      <div className="bg-white rounded-2xl shadow-md p-8 max-w-md w-full text-center">
        <div className="text-5xl mb-4">🌱</div>
        <h1 className="text-2xl font-bold text-garden-700 mb-3">
          Account pending approval
        </h1>
        <p className="text-gray-600 mb-4">
          Thank you for signing up! You're on the waitlist for South Austin Community Garden.
          An admin will review your application and assign a plot soon.
        </p>
        <p className="text-gray-500 text-sm mb-6">
          Questions? Reach us at{' '}
          <a
            href={`mailto:${CONTACT_EMAIL}`}
            className="text-garden-600 underline hover:text-garden-700"
          >
            {CONTACT_EMAIL}
          </a>
        </p>
        <button
          onClick={handleSignOut}
          className="w-full py-2 px-4 bg-garden-600 text-white rounded-lg hover:bg-garden-700 transition-colors font-medium"
        >
          Sign out
        </button>
      </div>
    </div>
  );
}
