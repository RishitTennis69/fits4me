import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { useToast } from '@/hooks/use-toast';
import { supabase } from '@/integrations/supabase/client';
import { useNavigate } from 'react-router-dom';
import { 
  Shirt, 
  Camera, 
  Zap, 
  CheckCircle, 
  ArrowRight, 
  Sparkles,
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
      const { error } = await supabase.auth.signInWithOtp({
        email,
        options: {
          emailRedirectTo: `${window.location.origin}/app`
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
    <div className="min-h-screen bg-gray-900">
      {/* Header with Auth */}
      <header className="absolute top-0 left-0 right-0 z-10">
        <div className="container mx-auto px-4 py-6">
          <div className="flex justify-between items-center">
            <div className="flex items-center">
              <Sparkles className="h-8 w-8 text-purple-400 mr-3" />
              <span className="text-2xl font-bold bg-gradient-to-r from-purple-400 via-blue-400 to-pink-400 bg-clip-text text-transparent">
                Fits4Me
              </span>
            </div>
            
            {/* Auth Section */}
            <div className="flex items-center gap-4">
              <div className="bg-gray-800/50 backdrop-blur-sm rounded-xl p-4 border border-gray-700">
                <div className="flex items-center gap-3">
                  <div>
                    <Label htmlFor="email" className="text-white text-sm">Email</Label>
                    <Input
                      id="email"
                      type="email"
                      placeholder="your@email.com"
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                      className="mt-1 bg-gray-700 border-gray-600 text-white placeholder:text-gray-400 w-48"
                    />
                  </div>
                  <Button 
                    onClick={handleAuth}
                    disabled={isLoading}
                    className="bg-gradient-to-r from-purple-500 to-blue-500 hover:from-purple-600 hover:to-blue-600"
                  >
                    {isLoading ? (
                      <>
                        <div className="animate-spin rounded-full h-4 w-4 border-2 border-white border-t-transparent mr-2" />
                        Sending...
                      </>
                    ) : (
                      <>
                        <Zap className="h-4 w-4 mr-2" />
                        {isSignUp ? 'Sign Up' : 'Sign In'}
                      </>
                    )}
                  </Button>
                </div>
                <p className="text-xs text-gray-300 text-center mt-2">
                  {isSignUp ? 'Already have an account?' : "Don't have an account?"}{' '}
                  <button
                    onClick={() => setIsSignUp(!isSignUp)}
                    className="text-purple-400 hover:text-purple-300 underline"
                  >
                    {isSignUp ? 'Sign In' : 'Sign Up'}
                  </button>
                </p>
              </div>
            </div>
          </div>
        </div>
      </header>

      {/* Hero Section */}
      <section className="relative overflow-hidden">
        <div className="absolute inset-0 bg-gradient-to-br from-purple-900/20 via-blue-900/20 to-pink-900/20"></div>
        <div className="relative container mx-auto px-4 py-20">
          <div className="text-center max-w-4xl mx-auto pt-20">
            <div className="flex items-center justify-center mb-6">
              <Sparkles className="h-8 w-8 text-white mr-3" />
              <span className="text-white font-semibold">AI-Powered Virtual Fitting</span>
            </div>
            <h1 className="text-6xl md:text-7xl font-bold leading-tight bg-gradient-to-r from-purple-400 via-blue-400 to-pink-400 bg-clip-text text-transparent mb-6">
              Fits4Me
            </h1>
            <p className="text-2xl md:text-3xl text-white mb-8 font-light">
              Only Buy What Fits
            </p>
            <p className="text-lg text-white mb-12 max-w-2xl mx-auto">
              Upload your photo, paste a clothing URL, and get instant AI-powered fit recommendations. 
              Never buy clothes that don't fit again.
            </p>

            <Button 
              onClick={scrollToMain}
              variant="outline"
              size="lg"
              className="border-white text-white hover:bg-white hover:text-gray-900 text-lg px-8 py-3"
            >
              Try It Now
              <ArrowRight className="h-5 w-5 ml-2" />
            </Button>
          </div>
        </div>
      </section>

      {/* Core Features */}
      <section className="py-20 bg-gray-800/30">
        <div className="container mx-auto px-4">
          <div className="text-center mb-16">
            <h2 className="text-4xl font-bold text-white mb-4">
              Why Choose Fits4Me?
            </h2>
            <p className="text-xl text-gray-400 max-w-2xl mx-auto">
              Advanced AI technology that understands your body and clothing fit like never before
            </p>
          </div>
          
          <div className="grid md:grid-cols-3 gap-8 max-w-6xl mx-auto">
            <Card className="bg-gray-800/50 border-gray-700 hover:border-purple-500 transition-colors">
              <CardHeader>
                <div className="w-12 h-12 bg-gradient-to-r from-purple-500 to-blue-500 rounded-lg flex items-center justify-center mb-4">
                  <Camera className="h-6 w-6 text-white" />
                </div>
                <CardTitle className="text-white">Smart Photo Analysis</CardTitle>
              </CardHeader>
              <CardContent>
                <p className="text-gray-400">
                  Upload a single photo and our AI analyzes your body proportions, measurements, and appearance for accurate fit predictions.
                </p>
              </CardContent>
            </Card>

            <Card className="bg-gray-800/50 border-gray-700 hover:border-purple-500 transition-colors">
              <CardHeader>
                <div className="w-12 h-12 bg-gradient-to-r from-blue-500 to-purple-500 rounded-lg flex items-center justify-center mb-4">
                  <Shirt className="h-6 w-6 text-white" />
                </div>
                <CardTitle className="text-white">Virtual Try-On</CardTitle>
              </CardHeader>
              <CardContent>
                <p className="text-gray-400">
                  See how clothes look on you with AI-generated virtual try-on images that match your actual appearance and body type.
                </p>
              </CardContent>
            </Card>

            <Card className="bg-gray-800/50 border-gray-700 hover:border-purple-500 transition-colors">
              <CardHeader>
                <div className="w-12 h-12 bg-gradient-to-r from-pink-500 to-purple-500 rounded-lg flex items-center justify-center mb-4">
                  <Target className="h-6 w-6 text-white" />
                </div>
                <CardTitle className="text-white">Precise Recommendations</CardTitle>
              </CardHeader>
              <CardContent>
                <p className="text-gray-400">
                  Get clear "Definitely", "Probably Yes", "Maybe", "Probably No", or "No Way" recommendations based on detailed fit analysis.
                </p>
              </CardContent>
            </Card>
          </div>
        </div>
      </section>

      {/* How It Works */}
      <section className="py-20">
        <div className="container mx-auto px-4">
          <div className="text-center mb-16">
            <h2 className="text-4xl font-bold text-white mb-4">
              How It Works
            </h2>
            <p className="text-xl text-gray-400 max-w-2xl mx-auto">
              Three simple steps to perfect fit recommendations
            </p>
          </div>
          
          <div className="grid md:grid-cols-3 gap-8 max-w-4xl mx-auto">
            <div className="text-center">
              <div className="w-16 h-16 bg-gradient-to-r from-purple-500 to-blue-500 rounded-full flex items-center justify-center mx-auto mb-6 text-2xl font-bold text-white">
                1
              </div>
              <h3 className="text-xl font-semibold text-white mb-4">Paste Clothing URL</h3>
              <p className="text-gray-400">
                Simply paste the URL of any clothing item from major retailers. Our AI extracts all the details automatically.
              </p>
            </div>
            
            <div className="text-center">
              <div className="w-16 h-16 bg-gradient-to-r from-blue-500 to-purple-500 rounded-full flex items-center justify-center mx-auto mb-6 text-2xl font-bold text-white">
                2
              </div>
              <h3 className="text-xl font-semibold text-white mb-4">Upload Your Photo</h3>
              <p className="text-gray-400">
                Take a photo or upload one. Our AI analyzes your body proportions and appearance for personalized recommendations.
              </p>
            </div>
            
            <div className="text-center">
              <div className="w-16 h-16 bg-gradient-to-r from-pink-500 to-purple-500 rounded-full flex items-center justify-center mx-auto mb-6 text-2xl font-bold text-white">
                3
              </div>
              <h3 className="text-xl font-semibold text-white mb-4">Get Your Results</h3>
              <p className="text-gray-400">
                Receive instant fit scores, virtual try-on images, and clear recommendations to make confident purchase decisions.
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* CTA Section */}
      <section className="py-20 bg-gradient-to-r from-purple-900/20 via-blue-900/20 to-pink-900/20">
        <div className="container mx-auto px-4 text-center">
          <h2 className="text-4xl font-bold text-white mb-6">
            Ready to Never Buy Ill-Fitting Clothes Again?
          </h2>
          <p className="text-xl text-gray-300 mb-8 max-w-2xl mx-auto">
            Join thousands of users who trust Fits4Me for accurate fit predictions and confident shopping.
          </p>
          <div className="flex flex-col sm:flex-row gap-4 justify-center">
            <Button 
              onClick={scrollToMain}
              size="lg"
              className="bg-gradient-to-r from-purple-500 to-blue-500 hover:from-purple-600 hover:to-blue-600 text-lg px-8 py-3"
            >
              Try It Free
              <ArrowRight className="h-5 w-5 ml-2" />
            </Button>
            <Button 
              variant="outline"
              size="lg"
              onClick={() => setIsSignUp(true)}
              className="border-purple-400 text-purple-400 hover:bg-purple-400 hover:text-gray-900 text-lg px-8 py-3"
            >
              Create Account
            </Button>
          </div>
        </div>
      </section>
    </div>
  );
};

export default Landing; 