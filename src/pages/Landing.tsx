import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { useToast } from '@/hooks/use-toast';
import { supabase } from '@/integrations/supabase/client';
import { useNavigate } from 'react-router-dom';
import { TShirtIcon } from '@/components/ui/tshirt-icon';
import { 
  Shirt, 
  Camera, 
  Zap, 
  CheckCircle, 
  ArrowRight, 
  Users,
  Smartphone,
  Target,
  Star
} from 'lucide-react';

const Landing = () => {
  const { toast } = useToast();
  const navigate = useNavigate();
  const [email, setEmail] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [isSignUp, setIsSignUp] = useState(false);
  const [showAuthModal, setShowAuthModal] = useState(false);

  const handleAuth = async () => {
    if (!email) {
      toast({
        title: "Email Required",
        description: "Please enter your email address",
        variant: "destructive"
      });
      return;
    }

    setIsLoading(true);
    try {
      // Try using a relative redirect URL first, fallback to absolute
      const redirectUrl = window.location.hostname === 'localhost' 
        ? `${window.location.origin}/dashboard`
        : 'https://fits4me.vercel.app/dashboard';
      console.log('Current origin:', window.location.origin);
      console.log('Redirect URL:', redirectUrl);
      
      const { error } = await supabase.auth.signInWithOtp({
        email,
        options: {
          emailRedirectTo: redirectUrl
        }
      });

      if (error) throw error;

      toast({
        title: "Magic Link Sent!",
        description: `Check your email for the ${isSignUp ? 'sign up' : 'login'} link`,
      });
    } catch (error) {
      console.error('Auth error:', error);
      toast({
        title: "Error",
        description: "Failed to send magic link. Please try again.",
        variant: "destructive"
      });
    } finally {
      setIsLoading(false);
    }
  };

  const scrollToMain = () => {
    navigate('/app');
  };

  return (
    <div className="min-h-screen bg-white">
      {/* Header with Auth */}
      <header className="absolute top-0 left-0 right-0 z-10">
        <div className="container mx-auto px-4 py-6">
          <div className="flex justify-between items-center">
            {/* Auth Section */}
            <div className="flex items-center gap-3 ml-auto">
              <Button 
                onClick={() => {
                  setIsSignUp(false);
                  setShowAuthModal(true);
                }}
                variant="outline"
                className="border-purple-600 text-purple-600 hover:bg-purple-600 hover:text-white rounded-xl"
              >
                Sign In
              </Button>
              <Button 
                onClick={() => {
                  setIsSignUp(true);
                  setShowAuthModal(true);
                }}
                className="bg-purple-600 hover:bg-purple-700 text-white rounded-xl"
              >
                Sign Up
              </Button>
            </div>
          </div>
        </div>
      </header>

      {/* Hero Section */}
      <section className="relative overflow-hidden bg-white">
        <div className="relative container mx-auto px-4 py-20">
          <div className="grid lg:grid-cols-2 gap-12 items-center pt-20">
            {/* Left side - Text content */}
            <div className="text-center lg:text-left">
              <h1 className="text-6xl md:text-7xl font-bold leading-tight bg-gradient-to-r from-purple-500 via-blue-500 to-pink-500 bg-clip-text text-transparent mb-6">
                Fits4Me
              </h1>
              <p className="text-2xl md:text-3xl text-gray-800 mb-8 font-semibold">
                Only Buy What Fits
              </p>
              <p className="text-lg text-gray-600 mb-12 max-w-2xl mx-auto lg:mx-0">
                Upload your photo, paste a clothing URL, and get instant AI-powered fit recommendations. 
                Never buy clothes that don't fit again.
              </p>

              <Button 
                onClick={scrollToMain}
                variant="outline"
                size="lg"
                className="border-blue-600 text-blue-600 hover:bg-blue-600 hover:text-white text-lg px-8 py-3 rounded-xl"
              >
                Try It Now
                <ArrowRight className="h-5 w-5 ml-2" />
              </Button>
            </div>

            {/* Right side - App visualization */}
            <div className="relative flex justify-center lg:justify-end lg:mr-8">
              {/* Phone frame */}
              <div className="relative w-80 h-[600px] bg-gray-900 rounded-[3rem] p-3 shadow-2xl">
                {/* Screen */}
                <div className="w-full h-full bg-white rounded-[2.5rem] overflow-hidden relative">
                  {/* Status bar */}
                  <div className="h-8 bg-gradient-to-r from-purple-500 to-blue-500 flex items-center justify-between px-6 text-white text-sm">
                    <span>9:41</span>
                    <div className="flex items-center gap-1">
                      <div className="w-1 h-1 bg-white rounded-full"></div>
                      <div className="w-1 h-1 bg-white rounded-full"></div>
                      <div className="w-1 h-1 bg-white rounded-full"></div>
                    </div>
                  </div>

                  {/* App content */}
                  <div className="p-6 h-full overflow-y-auto">
                    {/* Header */}
                    <div className="flex items-center justify-between mb-6">
                      <div className="flex items-center">
                        <div className="w-8 h-8 bg-gradient-to-r from-purple-500 to-blue-500 rounded-lg flex items-center justify-center mr-3">
                          <TShirtIcon className="h-4 w-4 text-white" />
                        </div>
                        <span className="text-lg font-bold bg-gradient-to-r from-purple-500 via-blue-500 to-pink-500 bg-clip-text text-transparent">
                          Fits4Me
                        </span>
                      </div>
                      <div className="w-8 h-8 bg-gray-100 rounded-full flex items-center justify-center">
                        <span className="text-sm text-gray-600">👤</span>
                      </div>
                    </div>

                    {/* Upload section */}
                    <div className="bg-gradient-to-br from-purple-50 to-blue-50 rounded-2xl p-4 mb-6">
                      <h3 className="font-semibold text-gray-900 mb-3">Upload Your Photo</h3>
                      <div className="border-2 border-dashed border-purple-300 rounded-xl p-6 text-center">
                        <div className="w-12 h-12 bg-purple-100 rounded-full flex items-center justify-center mx-auto mb-3">
                          <Camera className="h-6 w-6 text-purple-600" />
                        </div>
                        <p className="text-sm text-gray-600">Tap to upload photo</p>
                      </div>
                    </div>

                    {/* URL input */}
                    <div className="bg-white border border-gray-200 rounded-2xl p-4 mb-6">
                      <h3 className="font-semibold text-gray-900 mb-3">Paste Clothing URL</h3>
                      <div className="bg-gray-50 rounded-xl p-3 text-sm text-gray-500">
                        https://www.nike.com/t/dri-fit-training-shirt...
                      </div>
                    </div>

                    {/* Sample result */}
                    <div className="bg-white border border-gray-200 rounded-2xl p-4">
                      <h3 className="font-semibold text-gray-900 mb-3">Fit Analysis</h3>
                      <div className="flex items-center justify-between mb-3">
                        <span className="text-sm text-gray-600">Nike Dri-FIT Shirt</span>
                        <div className="bg-green-100 text-green-800 px-2 py-1 rounded-full text-xs font-medium">
                          Definitely
                        </div>
                      </div>
                      <div className="bg-gray-100 rounded-xl h-24 flex items-center justify-center">
                        <div className="text-center">
                          <div className="w-8 h-8 bg-gradient-to-r from-green-400 to-green-600 rounded-full flex items-center justify-center mx-auto mb-2">
                            <CheckCircle className="h-4 w-4 text-white" />
                          </div>
                          <p className="text-xs text-gray-600">Virtual Try-On</p>
                        </div>
                      </div>
                      <div className="mt-3 flex items-center justify-between">
                        <span className="text-sm text-gray-600">Fit Score</span>
                        <span className="text-lg font-bold text-green-600">92%</span>
                      </div>
                    </div>
                  </div>
                </div>

                {/* Home indicator */}
                <div className="absolute bottom-2 left-1/2 transform -translate-x-1/2 w-32 h-1 bg-gray-400 rounded-full"></div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Core Features */}
      <section className="py-20" style={{ backgroundColor: '#FAFBFC' }}>
        <div className="container mx-auto px-4">
          <div className="text-center mb-16">
            <h2 className="text-4xl font-bold mb-4 bg-gradient-to-r from-blue-600 to-blue-800 bg-clip-text text-transparent">
              Why Choose Fits4Me?
            </h2>
            <p className="text-xl text-gray-600 max-w-2xl mx-auto">
              Advanced AI technology that understands your body and clothing fit like never before
            </p>
          </div>
          
          <div className="grid md:grid-cols-3 gap-8 max-w-6xl mx-auto">
            <Card className="bg-white border-gray-200 hover:border-purple-500 transition-colors shadow-lg rounded-xl">
              <CardHeader>
                <div className="w-12 h-12 bg-gradient-to-r from-purple-500 to-blue-500 rounded-lg flex items-center justify-center mb-4">
                  <Camera className="h-6 w-6 text-white" />
                </div>
                <CardTitle className="text-gray-900">Smart Photo Analysis</CardTitle>
              </CardHeader>
              <CardContent>
                <p className="text-gray-600">
                  Upload a single photo and our AI analyzes your body proportions, measurements, and appearance for accurate fit predictions.
                </p>
              </CardContent>
            </Card>

            <Card className="bg-white border-gray-200 hover:border-purple-500 transition-colors shadow-lg rounded-xl">
              <CardHeader>
                <div className="w-12 h-12 bg-gradient-to-r from-blue-400 to-blue-700 rounded-lg flex items-center justify-center mb-4">
                  <Shirt className="h-6 w-6 text-white" />
                </div>
                <CardTitle className="text-gray-900">Virtual Try-On</CardTitle>
              </CardHeader>
              <CardContent>
                <p className="text-gray-600">
                  See how clothes look on you with AI-generated virtual try-on images that match your actual appearance and body type.
                </p>
              </CardContent>
            </Card>

            <Card className="bg-white border-gray-200 hover:border-purple-500 transition-colors shadow-lg rounded-xl">
              <CardHeader>
                <div className="w-12 h-12 bg-gradient-to-r from-pink-500 to-purple-500 rounded-lg flex items-center justify-center mb-4">
                  <Target className="h-6 w-6 text-white" />
                </div>
                <CardTitle className="text-gray-900">Precise Recommendations</CardTitle>
              </CardHeader>
              <CardContent>
                <p className="text-gray-600">
                  Get clear "Definitely", "Probably Yes", "Maybe", "Probably No", or "No Way" recommendations based on detailed fit analysis.
                </p>
              </CardContent>
            </Card>
          </div>
        </div>
      </section>

      {/* How It Works */}
      <section className="py-20" style={{ backgroundColor: '#f8f8ff' }}>
        <div className="container mx-auto px-4">
          <div className="text-center mb-16">
            <h2 className="text-4xl font-bold mb-4 bg-gradient-to-r from-blue-600 to-blue-800 bg-clip-text text-transparent">
              How It Works
            </h2>
            <p className="text-xl text-gray-600 max-w-2xl mx-auto">
              Three simple steps to perfect fit recommendations
            </p>
          </div>
          
          <div className="grid md:grid-cols-3 gap-8 max-w-4xl mx-auto">
            <div className="text-center">
              <div className="w-16 h-16 bg-gradient-to-r from-purple-500 to-blue-500 rounded-full flex items-center justify-center mx-auto mb-6 text-2xl font-bold text-white">
                1
              </div>
              <h3 className="text-xl font-semibold text-gray-900 mb-4">Paste Clothing URL</h3>
              <p className="text-gray-600">
                Simply paste the URL of any clothing item from major retailers. Our AI extracts all the details automatically.
              </p>
            </div>
            
            <div className="text-center">
              <div className="w-16 h-16 bg-gradient-to-r from-blue-400 to-blue-700 rounded-full flex items-center justify-center mx-auto mb-6 text-2xl font-bold text-white">
                2
              </div>
              <h3 className="text-xl font-semibold text-gray-900 mb-4">Upload Your Photo</h3>
              <p className="text-gray-600">
                Take a photo or upload one. Our AI analyzes your body proportions and appearance for personalized recommendations.
              </p>
            </div>
            
            <div className="text-center">
              <div className="w-16 h-16 bg-gradient-to-r from-pink-500 to-purple-500 rounded-full flex items-center justify-center mx-auto mb-6 text-2xl font-bold text-white">
                3
              </div>
              <h3 className="text-xl font-semibold text-gray-900 mb-4">Get Your Results</h3>
              <p className="text-gray-600">
                Receive instant fit scores, virtual try-on images, and clear recommendations to make confident purchase decisions.
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* CTA Section */}
      <section className="py-20 bg-gradient-to-br from-purple-300 via-blue-400 to-blue-500">
        <div className="container mx-auto px-4 text-center">
          <h2 className="text-4xl font-bold text-white mb-8">
            Ready to Never Buy Poor Fitting Clothes Again?
          </h2>
          <div className="flex flex-col sm:flex-row gap-4 justify-center">
            <Button 
              onClick={scrollToMain}
              size="lg"
              className="bg-white text-purple-700 hover:bg-gray-100 text-lg px-8 py-3 rounded-xl font-semibold"
            >
              Try It Free
              <ArrowRight className="h-5 w-5 ml-2" />
            </Button>
            <Button 
              variant="outline"
              size="lg"
              onClick={() => setIsSignUp(true)}
              className="bg-white text-purple-700 hover:bg-gray-100 text-lg px-8 py-3 rounded-xl font-semibold"
            >
              Create Account
            </Button>
          </div>
        </div>
      </section>
      
      {/* Auth Modal */}
      {showAuthModal && (
        <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-50 p-4">
          <div className="bg-white border border-gray-200 rounded-2xl p-8 max-w-md w-full shadow-xl">
            <div className="flex justify-between items-center mb-6">
              <h2 className="text-2xl font-bold text-gray-900">
                {isSignUp ? 'Create Account' : 'Sign In'}
              </h2>
              <Button
                variant="ghost"
                size="sm"
                onClick={() => setShowAuthModal(false)}
                className="text-gray-400 hover:text-gray-600 rounded-xl"
              >
                ✕
              </Button>
            </div>
            
            <div className="space-y-4">
              <div>
                <Label htmlFor="modal-email" className="text-gray-700">Email</Label>
                <Input
                  id="modal-email"
                  type="email"
                  placeholder="your@email.com"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  className="mt-2 bg-white border-gray-300 text-gray-900 placeholder:text-gray-500 rounded-xl"
                />
              </div>
              <Button 
                onClick={handleAuth}
                disabled={isLoading}
                className="w-full bg-gradient-to-r from-purple-600 to-blue-600 hover:from-purple-700 hover:to-blue-700 text-lg py-3 rounded-xl"
              >
                {isLoading ? (
                  <>
                    <div className="animate-spin rounded-full h-5 w-5 border-2 border-white border-t-transparent mr-2" />
                    Sending...
                  </>
                ) : (
                  <>
                    <Zap className="h-5 w-5 mr-2" />
                    {isSignUp ? 'Sign Up' : 'Sign In'} with Magic Link
                  </>
                )}
              </Button>
              <p className="text-sm text-gray-600 text-center">
                {isSignUp ? 'Already have an account?' : "Don't have an account?"}{' '}
                <button
                  onClick={() => setIsSignUp(!isSignUp)}
                  className="text-purple-600 hover:text-purple-700 underline"
                >
                  {isSignUp ? 'Sign In' : 'Sign Up'}
                </button>
              </p>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default Landing; 