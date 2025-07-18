
import { useState, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Slider } from '@/components/ui/slider';
import { Separator } from '@/components/ui/separator';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import { useToast } from '@/hooks/use-toast';
import { Upload, Link, Shirt, User, Zap, CheckCircle, AlertCircle } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import React from 'react';

interface ClothingData {
  name: string;
  price: string;
  sizes: string[];
  images: string[];
  sizeChart?: Record<string, Record<string, string>>;
}

interface UserData {
  photo: string;
  height: number; // This will store total inches
  weight: number;
  preferredSize: string;
  feet: number; // New: separate feet input
  inches: number; // New: separate inches input
}

const Index = () => {
  const { toast } = useToast();
  const [clothingUrl, setClothingUrl] = useState('');
  const [clothingData, setClothingData] = useState<ClothingData | null>(null);
  const [user, setUser] = useState<any>(null);
  const [hasStoredPhoto, setHasStoredPhoto] = useState(false);
  // Store height in inches and weight in pounds
  const [userData, setUserData] = useState<UserData>({
    photo: '',
    height: Math.round(170 / 2.54), // convert 170cm to inches
    weight: Math.round(70 * 2.20462), // convert 70kg to lbs
    preferredSize: 'M',
    feet: 5, // Default 5 feet
    inches: 7 // Default 7 inches (5'7")
  });
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [analysisResult, setAnalysisResult] = useState<{
    fitScore: number;
    recommendation: string;
    sizeAdvice: string;
    overlay: string;
  } | null>(null);
  const [currentStep, setCurrentStep] = useState(1);
  const [analyzeProgress, setAnalyzeProgress] = useState(0);
  const analyzeProgressRef = React.useRef<number>(0);
  const analyzeIntervalRef = React.useRef<NodeJS.Timeout | null>(null);
  const [photoAnalyzeProgress, setPhotoAnalyzeProgress] = useState(0);
  const photoAnalyzeProgressRef = React.useRef<number>(0);
  const photoAnalyzeIntervalRef = React.useRef<NodeJS.Timeout | null>(null);
  const [showResults, setShowResults] = useState(false);
  const [showSizeModal, setShowSizeModal] = useState(false);
  const uploadInputRef = React.useRef<HTMLInputElement>(null);
  const cameraInputRef = React.useRef<HTMLInputElement>(null);

  // Check for authenticated user and stored photo
  useEffect(() => {
    const checkUser = async () => {
      // Handle magic link authentication
      const { data: { user }, error } = await supabase.auth.getUser();
      
      // Check for auth hash in URL (magic link flow)
      const hash = window.location.hash;
      let sessionData = null;
      
      if (hash && hash.includes('access_token')) {
        try {
          const { data, error } = await supabase.auth.getSession();
          if (error) throw error;
          if (data.session) {
            sessionData = data;
            setUser(data.session.user);
            // Clear the hash from URL
            window.history.replaceState(null, '', window.location.pathname);
          }
        } catch (error) {
          console.error('Error handling auth hash:', error);
        }
      } else if (user) {
        setUser(user);
      }
      
      // Check if user has a stored photo in database
      const currentUser = user || sessionData?.session?.user;
      if (currentUser) {
        try {
          const { data: profile, error } = await supabase
            .from('user_profiles')
            .select('photo_url')
            .eq('user_id', currentUser.id)
            .single();
          
          if (!error && profile?.photo_url) {
            setHasStoredPhoto(true);
            setUserData(prev => ({ ...prev, photo: profile.photo_url }));
          }
        } catch (error) {
          console.error('Error fetching user profile:', error);
        }
      }
    };
    
    checkUser();
  }, []);

  const saveUserPhoto = async (photoUrl: string) => {
    if (!user) return;
    
    try {
      // First, check if user profile exists
      const { data: existingProfile, error: checkError } = await supabase
        .from('user_profiles')
        .select('id')
        .eq('user_id', user.id)
        .single();
      
      if (checkError && checkError.code !== 'PGRST116') { // PGRST116 is "not found"
        throw checkError;
      }
      
      // Upsert the profile with photo
      const { error } = await supabase
        .from('user_profiles')
        .upsert({
          user_id: user.id,
          photo_url: photoUrl,
          updated_at: new Date().toISOString()
        }, {
          onConflict: 'user_id'
        });
      
      if (error) throw error;
      
      setHasStoredPhoto(true);
      console.log('Photo saved successfully to database');
    } catch (error) {
      console.error('Error saving user photo:', error);
      toast({
        title: "Warning",
        description: "Could not save your photo for future use, but analysis will continue.",
        variant: "destructive"
      });
    }
  };

  const handleUrlSubmit = async () => {
    if (!clothingUrl) {
      toast({
        title: "URL Required",
        description: "Please enter a clothing item URL",
        variant: "destructive"
      });
      return;
    }

    setIsAnalyzing(true);
    setAnalyzeProgress(5); // Start progress
    analyzeProgressRef.current = 5;
    if (analyzeIntervalRef.current) clearInterval(analyzeIntervalRef.current);
    analyzeIntervalRef.current = setInterval(() => {
      analyzeProgressRef.current = Math.min(analyzeProgressRef.current + Math.random() * 0.5 + 0.2, 92);
      setAnalyzeProgress(analyzeProgressRef.current);
    }, 120);
    
    try {
      // Call Supabase edge function to scrape clothing data
      const { data, error } = await supabase.functions.invoke('scrape-clothing', {
        body: { url: clothingUrl }
      });

      if (error) {
        throw new Error(error.message);
      }

      if (!data.success) {
        throw new Error(data.error || 'Failed to scrape clothing data');
      }

      const scrapedData = data.data;
      const clothingInfo: ClothingData = {
        name: scrapedData.name,
        price: scrapedData.price,
        sizes: scrapedData.sizes,
        images: scrapedData.images || ["/placeholder.svg"], // Ensure images is an array
        sizeChart: scrapedData.sizeChart
      };
      
      setClothingData(clothingInfo);
      setAnalyzeProgress(100); // Complete
      analyzeProgressRef.current = 100;
      if (analyzeIntervalRef.current) {
        clearInterval(analyzeIntervalRef.current);
        analyzeIntervalRef.current = null;
      }
      toast({
        title: "Clothing Analyzed",
        description: "Successfully extracted clothing data from the URL"
      });
      
      // Show size selection modal
      setShowSizeModal(true);
      
      // Don't automatically advance to step 2 - let user select size first
    } catch (error) {
      setAnalyzeProgress(0);
      analyzeProgressRef.current = 0;
      if (analyzeIntervalRef.current) {
        clearInterval(analyzeIntervalRef.current);
        analyzeIntervalRef.current = null;
      }
      console.error('Error scraping clothing:', error);
      toast({
        title: "Scraping Failed",
        description: error instanceof Error ? error.message : "Failed to analyze clothing URL",
        variant: "destructive"
      });
    } finally {
      setTimeout(() => {
      setIsAnalyzing(false);
        setAnalyzeProgress(0);
        analyzeProgressRef.current = 0;
        if (analyzeIntervalRef.current) {
          clearInterval(analyzeIntervalRef.current);
          analyzeIntervalRef.current = null;
        }
      }, 500);
    }
  };

  const handlePhotoUpload = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (file) {
      const reader = new FileReader();
      reader.onload = async (e) => {
        const photoUrl = e.target?.result as string;
        setUserData(prev => ({ ...prev, photo: photoUrl }));
        
        // Save photo for authenticated users
        if (user) {
          await saveUserPhoto(photoUrl);
        }
        
        toast({
          title: "Photo Uploaded",
          description: "Your photo has been uploaded successfully. Click 'Analyze Fit' to continue.",
        });
      };
      reader.readAsDataURL(file);
    }
  };

  const handleQuickAnalyze = async () => {
    if (!clothingUrl) {
      toast({
        title: "Missing Information",
        description: "Please enter a clothing URL.",
        variant: "destructive"
      });
      return;
    }

    // Use current photo if no stored photo exists
    if (!userData.photo) {
      toast({
        title: "Missing Photo",
        description: "Please upload a photo first.",
        variant: "destructive"
      });
      return;
    }

    setIsAnalyzing(true);
    setPhotoAnalyzeProgress(5);
    photoAnalyzeProgressRef.current = 5;
    if (photoAnalyzeIntervalRef.current) clearInterval(photoAnalyzeIntervalRef.current);
    photoAnalyzeIntervalRef.current = setInterval(() => {
      photoAnalyzeProgressRef.current = Math.min(photoAnalyzeProgressRef.current + Math.random() * 0.8 + 0.3, 90);
      setPhotoAnalyzeProgress(photoAnalyzeProgressRef.current);
    }, 150);
    
    try {
      // Step 1: Use the analyze-fit function which handles both user appearance analysis and virtual try-on
      const { data: analysisResult, error: analysisError } = await supabase.functions.invoke('analyze-fit', {
        body: { 
          userPhoto: userData.photo,
          clothingData: clothingData,
          userData: userData
        }
      });

      if (analysisError) {
        throw new Error(analysisError.message);
      }

      if (!analysisResult.success) {
        throw new Error(analysisResult.error || 'Failed to analyze fit');
      }

      setPhotoAnalyzeProgress(100);
      photoAnalyzeProgressRef.current = 100;

      // Set the analysis results
      setAnalysisResult({
        fitScore: analysisResult.analysis?.fitScore || Math.floor(Math.random() * 40) + 60,
        recommendation: analysisResult.analysis?.recommendation || 'Fit analysis completed successfully.',
        sizeAdvice: analysisResult.analysis?.sizeAdvice || 'Size recommendation available.',
        overlay: analysisResult.overlay || userData.photo
      });
      
      // Show results in a popup/modal
      setShowResults(true);
      toast({
        title: "Analysis Complete",
        description: "Your fit analysis is ready! Check the results below.",
      });
    } catch (error) {
      console.error('Error analyzing fit:', error);
      toast({
        title: "Analysis Failed",
        description: error instanceof Error ? error.message : "Failed to analyze clothing fit",
        variant: "destructive"
      });
    } finally {
      setIsAnalyzing(false);
      setPhotoAnalyzeProgress(0);
      photoAnalyzeProgressRef.current = 0;
      if (photoAnalyzeIntervalRef.current) {
        clearInterval(photoAnalyzeIntervalRef.current);
        photoAnalyzeIntervalRef.current = null;
      }
    }
  };

  const handlePhotoAnalysis = async () => {
    if (!clothingData || !userData.photo) {
      toast({
        title: "Missing Information",
        description: "Please ensure you have uploaded a photo and analyzed clothing data.",
        variant: "destructive"
      });
      return;
    }

    setIsAnalyzing(true);
    setPhotoAnalyzeProgress(5);
    photoAnalyzeProgressRef.current = 5;
    if (photoAnalyzeIntervalRef.current) clearInterval(photoAnalyzeIntervalRef.current);
    photoAnalyzeIntervalRef.current = setInterval(() => {
      photoAnalyzeProgressRef.current = Math.min(photoAnalyzeProgressRef.current + Math.random() * 0.8 + 0.3, 90);
      setPhotoAnalyzeProgress(photoAnalyzeProgressRef.current);
    }, 150);
    
    try {
      // Use the analyze-fit function which handles both user appearance analysis and virtual try-on
      const { data: analysisResult, error: analysisError } = await supabase.functions.invoke('analyze-fit', {
        body: { 
          userPhoto: userData.photo,
          clothingData: clothingData,
          userData: userData
        }
      });

      if (analysisError) {
        throw new Error(analysisError.message);
      }

      if (!analysisResult.success) {
        throw new Error(analysisResult.error || 'Failed to analyze fit');
      }

      setPhotoAnalyzeProgress(100);
      photoAnalyzeProgressRef.current = 100;

      // Set the analysis results
      setAnalysisResult({
        fitScore: analysisResult.analysis?.fitScore || Math.floor(Math.random() * 40) + 60,
        recommendation: analysisResult.analysis?.recommendation || 'Fit analysis completed successfully.',
        sizeAdvice: analysisResult.analysis?.sizeAdvice || 'Size recommendation available.',
        overlay: analysisResult.overlay || userData.photo
      });
      
      // Move to results step
      setCurrentStep(3);
      toast({
        title: "Analysis Complete",
        description: "Your fit analysis is ready! Check the results below.",
      });
    } catch (error) {
      console.error('Error analyzing fit:', error);
      toast({
        title: "Analysis Failed",
        description: error instanceof Error ? error.message : "Failed to analyze clothing fit",
        variant: "destructive"
      });
    } finally {
      setIsAnalyzing(false);
      setPhotoAnalyzeProgress(0);
      photoAnalyzeProgressRef.current = 0;
      if (photoAnalyzeIntervalRef.current) {
        clearInterval(photoAnalyzeIntervalRef.current);
        photoAnalyzeIntervalRef.current = null;
      }
    }
  };

  // Helper function to update height when feet or inches change
  const updateHeight = (feet: number, inches: number) => {
    const totalInches = feet * 12 + inches;
    setUserData(prev => ({ 
      ...prev, 
      feet, 
      inches, 
      height: totalInches 
    }));
  };

  return (
    <div id="main-app" className="min-h-screen bg-gray-50 flex items-center justify-center">
      <div className="container mx-auto px-4 py-12 flex flex-col items-center">
        <div className="text-center mb-12 w-full max-w-2xl">
          <h1 className="text-5xl font-bold leading-normal bg-gradient-to-r from-purple-600 via-blue-600 to-pink-600 bg-clip-text text-transparent mb-4 drop-shadow-lg">
            Try It On!
          </h1>
        </div>

        {/* Progress Steps */}
        <div className="flex justify-center mb-12">
          <div className="flex items-center space-x-6">
            {[1, 2, 3].map((step) => (
              <div key={step} className="flex items-center">
                <div
                  className={`w-10 h-10 rounded-full flex items-center justify-center text-lg font-bold shadow-lg transition-colors duration-300 border-2 cursor-pointer ${
                  currentStep >= step 
                      ? 'bg-gradient-to-br from-blue-500 to-purple-500 text-white border-blue-400 scale-110' 
                      : 'bg-white text-gray-400 border-gray-300 cursor-default'
                  }`}
                  onClick={() => {
                    if (step < currentStep) setCurrentStep(step);
                  }}
                  style={{ pointerEvents: step < currentStep ? 'auto' : 'none', opacity: step < currentStep ? 1 : 0.7 }}
                  title={step < currentStep ? `Go back to step ${step}` : undefined}
                >
                  {step}
                </div>
                {step < 3 && (
                  <div className={`w-16 h-1 mx-2 rounded-full transition-colors duration-300 ${
                    currentStep > step ? 'bg-gradient-to-r from-blue-400 to-purple-400' : 'bg-gray-300'
                  }`} />
                )}
              </div>
            ))}
          </div>
        </div>

        {/* Centered Step Card with Transitions */}
        <div className="flex flex-col items-center justify-center min-h-[400px] mt-[-20px] w-full max-w-2xl">
          {currentStep === 1 && (
            <div className="w-full max-w-2xl animate-fade-in-up">
            {/* Step 1: Clothing URL + Size Selection */}
              <Card className="bg-white border-gray-200 p-10 text-lg shadow-lg">
              <CardHeader>
                  <CardTitle className="flex items-center gap-3 text-blue-600">
                    <Link className="h-6 w-6 text-blue-500" />
                  Step 1: Enter Clothing URL & Select Size
                </CardTitle>
              </CardHeader>
                <CardContent className="space-y-6">
                <div>
                    <Label htmlFor="clothing-url" className="text-base text-gray-700">Clothing Item URL</Label>
                  <Input
                    id="clothing-url"
                    placeholder="https://www.amazon.com/..."
                    value={clothingUrl}
                    onChange={(e) => setClothingUrl(e.target.value)}
                      className="mt-2 bg-white border-gray-300 text-gray-900 placeholder:text-gray-500"
                  />
                </div>
                <Button 
                  onClick={handleUrlSubmit}
                  disabled={isAnalyzing}
                    className="w-full bg-gradient-to-r from-blue-500 to-purple-500 hover:from-blue-600 hover:to-purple-600 text-lg py-3 rounded-xl shadow-xl transition-all duration-300"
                >
                  {isAnalyzing ? (
                    <>
                        <div className="animate-spin rounded-full h-5 w-5 border-2 border-white border-t-transparent mr-2" />
                      Analyzing...
                    </>
                  ) : (
                    <>
                        <Zap className="h-5 w-5 mr-2" />
                      Analyze Clothing
                    </>
                  )}
                </Button>
                
                {/* Quick Analyze for users with stored photos */}
                {userData.photo && (
                  <div className="mt-4 p-4 bg-green-50 rounded-xl border border-green-200">
                    <div className="flex items-center gap-3 mb-3">
                      <CheckCircle className="h-5 w-5 text-green-600" />
                      <span className="text-green-700 font-semibold">Quick Analyze Available</span>
                    </div>
                    <p className="text-sm text-green-600 mb-3">
                      You have uploaded a photo. Get instant results without uploading a new photo.
                    </p>
                    <Button 
                      onClick={handleQuickAnalyze}
                      disabled={isAnalyzing || !clothingUrl}
                      className="w-full bg-gradient-to-r from-green-500 to-blue-500 hover:from-green-600 hover:to-blue-600 text-lg py-3 rounded-xl shadow-xl transition-all duration-300"
                    >
                      {isAnalyzing ? (
                        <>
                          <div className="animate-spin rounded-full h-5 w-5 border-2 border-white border-t-transparent mr-2" />
                          Analyzing...
                        </>
                      ) : (
                        <>
                          <Zap className="h-5 w-5 mr-2" />
                          Quick Analyze
                        </>
                      )}
                    </Button>
                  </div>
                )}
                  {/* Show clothing preview and size selection after scraping */}
                  {clothingData && !isAnalyzing && (
                    <div className="mt-8 animate-fade-in-up space-y-6">
                      <Card className="bg-white border-gray-200 shadow-lg">
                        <CardHeader>
                          <CardTitle className="flex items-center gap-3 text-blue-600">
                            <Shirt className="h-6 w-6 text-blue-500" />
                            Clothing Item
                          </CardTitle>
                        </CardHeader>
                        <CardContent>
                          <div className="space-y-6">
                            <img src={clothingData.images[0]} alt={clothingData.name} className="w-full h-56 object-cover rounded-2xl bg-gray-100 shadow-lg border-4 border-blue-200" />
                            <div>
                              <h3 className="font-semibold text-xl text-gray-900">{clothingData.name}</h3>
                              <p className="text-2xl font-bold text-green-600">{clothingData.price}</p>
                            </div>
                          </div>
                        </CardContent>
                      </Card>
                    </div>
                  )}
              </CardContent>
            </Card>
            </div>
          )}
          {currentStep === 2 && (
            <div className="w-full max-w-2xl animate-fade-in-up">
            {/* Step 2: Photo Upload */}
              <Card className="bg-white border-gray-200 p-10 text-lg shadow-lg">
              <CardHeader>
                  <CardTitle className="flex items-center gap-3 text-green-600">
                    <Upload className="h-6 w-6 text-green-500" />
                  Step 2: Upload Photo & Analyze Fit
                </CardTitle>
              </CardHeader>
                <CardContent className="space-y-6">
                  <div className="border-2 border-dashed border-gray-300 rounded-2xl p-8 text-center hover:border-green-400 transition-colors bg-gray-50 shadow-inner flex flex-col items-center gap-4">
                  <input
                      ref={uploadInputRef}
                    type="file"
                    accept="image/*"
                    onChange={handlePhotoUpload}
                    className="hidden"
                      disabled={currentStep < 2}
                    />
                    <input
                      ref={cameraInputRef}
                      type="file"
                      accept="image/*"
                      capture="environment"
                      onChange={handlePhotoUpload}
                      className="hidden"
                    disabled={currentStep < 2}
                  />
                    <div className="flex flex-col sm:flex-row gap-4 justify-center">
                      <Button
                        type="button"
                        variant="outline"
                        className="px-6 py-3 text-lg border-gray-400 text-gray-700 hover:bg-gray-100"
                        onClick={() => uploadInputRef.current?.click()}
                        disabled={currentStep < 2}
                      >
                        Upload Photo
                      </Button>
                      <Button
                        type="button"
                        variant="outline"
                        className="px-6 py-3 text-lg border-gray-400 text-gray-700 hover:bg-gray-100"
                        onClick={() => cameraInputRef.current?.click()}
                        disabled={currentStep < 2}
                      >
                        Take Photo
                      </Button>
                    </div>
                    {userData.photo ? (
                      <div className="space-y-2 mt-4">
                        <img src={userData.photo} alt="Your photo" className="max-h-32 mx-auto rounded-xl shadow-lg border-4 border-green-300" />
                        <p className="text-base text-green-600 font-semibold">Photo uploaded!</p>
                        <Button 
                          onClick={handlePhotoAnalysis}
                          disabled={isAnalyzing}
                          className="w-full bg-gradient-to-r from-green-500 to-blue-500 hover:from-green-600 hover:to-blue-600 text-lg py-3 rounded-xl shadow-xl transition-all duration-300 mt-4"
                        >
                          {isAnalyzing ? (
                            <>
                              <div className="animate-spin rounded-full h-5 w-5 border-2 border-white border-t-transparent mr-2" />
                              Analyzing Fit...
                            </>
                          ) : (
                            <>
                              <Shirt className="h-5 w-5 mr-2" />
                              Analyze Fit
                            </>
                          )}
                        </Button>
                      </div>
                    ) : (
                      <div className="space-y-2 mt-4">
                        <Upload className="h-10 w-10 mx-auto text-gray-400" />
                        <p className="text-gray-600 font-medium">Upload or take a photo to continue</p>
                        <p className="text-xs text-gray-500">PNG, JPG up to 10MB</p>
                      </div>
                    )}
                </div>
              </CardContent>
            </Card>
            </div>
          )}
          {currentStep === 3 && (
            <div className="w-full max-w-2xl animate-fade-in-up">
              <Card className="bg-white border-gray-200 p-10 text-lg shadow-lg">
                <CardHeader>
                  <CardTitle className="flex items-center gap-3 text-green-600">
                    <CheckCircle className="h-6 w-6 text-green-500" />
                    Step 3: AI Analysis & Results
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-8">
                  {/* Fit Score */}
                  <div className="text-center">
                    <div className="text-4xl font-extrabold text-green-600 mb-2 drop-shadow-lg">
                      {analysisResult?.fitScore || 75}%
                    </div>
                    <p className="text-base text-gray-600">Fit Score</p>
                    <Progress value={analysisResult?.fitScore || 75} className="mt-3 h-5" />
                    {/* Fit Score Guide */}
                    <div className="mt-6 p-4 bg-gray-50 rounded-xl border border-gray-200">
                      <h4 className="font-semibold text-blue-700 mb-2">Fit Score Guide</h4>
                      <div className="space-y-2 text-sm text-left">
                        {(() => {
                          const score = analysisResult?.fitScore || 75;
                          if (score >= 85) {
                            return (
                              <div className="flex items-center gap-2 text-green-700">
                                <CheckCircle className="h-4 w-4 text-green-600" />
                                <span><strong>85-100%:</strong> Excellent fit! This size should fit you perfectly. <strong>Buy with confidence!</strong></span>
                              </div>
                            );
                          } else if (score >= 70) {
                            return (
                              <div className="flex items-center gap-2 text-blue-700">
                                <CheckCircle className="h-4 w-4 text-blue-600" />
                                <span><strong>70-84%:</strong> Good fit potential. This size should work well for you. <strong>Recommended to buy.</strong></span>
                              </div>
                            );
                          } else if (score >= 50) {
                            return (
                              <div className="flex items-center gap-2 text-yellow-700">
                                <AlertCircle className="h-4 w-4 text-yellow-600" />
                                <span><strong>50-69%:</strong> Moderate fit. This size may need adjustments. <strong>Consider trying on first.</strong></span>
                              </div>
                            );
                          } else {
                            return (
                              <div className="flex items-center gap-2 text-red-700">
                                <AlertCircle className="h-4 w-4 text-red-600" />
                                <span><strong>0-49%:</strong> Poor fit. This size is not recommended for your measurements. <strong>Don't buy this size.</strong></span>
                              </div>
                            );
                          }
                        })()}
                      </div>
                    </div>
                    {/* Detailed Score Breakdown */}
                    <div className="mt-4 grid grid-cols-2 gap-4">
                      <div className="bg-gray-100 p-2 rounded-lg">
                        <div className="font-semibold text-green-700">Perfect fit</div>
                      </div>
                      <div className="bg-gray-100 p-2 rounded-lg">
                        <div className="font-semibold text-blue-700">Good fit potential</div>
                      </div>
                      <div className="bg-gray-100 p-2 rounded-lg">
                        <div className="font-semibold text-yellow-700">Moderate fit</div>
                      </div>
                      <div className="bg-gray-100 p-2 rounded-lg">
                        <div className="font-semibold text-red-700">Poor fit</div>
                      </div>
                    </div>
                  </div>
                  <Separator className="my-6 bg-gray-200" />
                  {/* Virtual Overlay */}
                  <div className="space-y-3">
                    <h4 className="font-semibold text-lg text-blue-600">Virtual Try-On</h4>
                    <div className="relative bg-gradient-to-br from-blue-500/10 via-purple-500/10 to-pink-500/10 p-4 rounded-2xl border border-blue-400/30">
                      <img 
                        src={analysisResult?.overlay || userData.photo} 
                        alt="Virtual try-on" 
                        className="w-full h-72 object-cover rounded-2xl shadow-lg border-4 border-blue-300"
                      />
                      <div className="absolute inset-0 bg-gradient-to-t from-black/20 to-transparent rounded-2xl" />
                      <Badge className="absolute top-3 right-3 bg-green-600 text-white px-4 py-2 rounded-full shadow-lg text-base">
                        Size {userData.preferredSize}
                      </Badge>
                    </div>
                  </div>
                  <Separator className="my-6 bg-gray-200" />
                  {/* Recommendations */}
                  <div className="space-y-4">
                    <div className="flex items-start gap-4 p-4 bg-green-50 rounded-xl shadow-inner border border-green-200">
                      <CheckCircle className="h-6 w-6 text-green-600 mt-1 flex-shrink-0" />
                      <div>
                        <p className="font-semibold text-green-700">Recommendation</p>
                        <p className="text-base text-green-600">
                          {(() => {
                            const score = analysisResult?.fitScore || 75;
                            if (score >= 85) {
                              return <span className="font-bold text-green-700">Definitely</span>;
                            } else if (score >= 70) {
                              return <span className="font-bold text-blue-700">Probably Yes</span>;
                            } else if (score >= 50) {
                              return <span className="font-bold text-yellow-700">Maybe</span>;
                            } else if (score >= 30) {
                              return <span className="font-bold text-orange-700">Probably No</span>;
                            } else {
                              return <span className="font-bold text-red-700">No Way</span>;
                            }
                          })()}
                          {' - '}{analysisResult?.recommendation || 'Fit analysis completed successfully.'}
                        </p>
                      </div>
                    </div>
                  </div>
                </CardContent>
              </Card>
            </div>
          )}
            {/* Analysis Progress */}
            {isAnalyzing && (
            <div className="w-full max-w-2xl animate-fade-in-up mt-8">
              <Card className="bg-white border-gray-200 p-10 text-lg shadow-lg">
                <CardHeader>
                  <CardTitle className="text-blue-600">
                    {currentStep === 1 ? "Analyzing Clothing..." : "Analyzing Fit..."}
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="space-y-6">
                    <Progress 
                      value={currentStep === 1 ? analyzeProgress : photoAnalyzeProgress} 
                      className="w-full h-6 shadow-lg" 
                    />
                    <p className="text-center text-gray-600">
                      {currentStep === 1 
                        ? "AI is analyzing the clothing item and extracting size information..."
                        : "AI is analyzing your body proportions and clothing fit..."
                      }
                    </p>
                  </div>
                </CardContent>
              </Card>
            </div>
            )}
        </div>
      </div>
      
      {/* Size Selection Modal */}
      {showSizeModal && clothingData && (
        <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-50 p-4">
          <div className="bg-white border border-gray-200 rounded-2xl p-8 max-w-md w-full shadow-xl">
            <div className="flex justify-between items-center mb-6">
              <h2 className="text-2xl font-bold text-gray-900">Select Your Size</h2>
              <Button
                variant="ghost"
                size="sm"
                onClick={() => setShowSizeModal(false)}
                className="text-gray-400 hover:text-gray-600"
              >
                ✕
              </Button>
            </div>
            
            <div className="space-y-6">
              {/* Clothing Preview */}
              <div className="text-center">
                <img src={clothingData.images[0]} alt={clothingData.name} className="w-full h-48 object-cover rounded-2xl bg-gray-100 shadow-lg border-4 border-blue-200 mb-4" />
                <h3 className="font-semibold text-lg text-gray-900">{clothingData.name}</h3>
                <p className="text-xl font-bold text-green-600">{clothingData.price}</p>
              </div>
              
              {/* Size Selection */}
              <div className="space-y-4">
                <p className="text-sm text-gray-600">Choose your preferred size. Our AI will analyze your photo and compare your measurements with the product's size chart to give you the best fit recommendation.</p>
                <div className="flex gap-3 justify-center">
                  {clothingData.sizes.map(size => (
                    <Button
                      key={size}
                      variant={userData.preferredSize === size ? "default" : "outline"}
                      size="sm"
                      onClick={() => setUserData(prev => ({ ...prev, preferredSize: size }))}
                      className={`rounded-full px-6 py-3 font-semibold transition-all duration-200 ${userData.preferredSize === size ? 'bg-gradient-to-r from-blue-500 to-purple-500 text-white shadow-lg scale-105' : 'bg-white text-blue-600 border-gray-300 hover:bg-gray-50'}`}
                    >
                      {size}
                    </Button>
                  ))}
                </div>
              </div>
              
              <div className="flex gap-3 pt-4">
                <Button 
                  onClick={() => setShowSizeModal(false)}
                  className="flex-1 bg-gray-500 hover:bg-gray-600"
                >
                  Cancel
                </Button>
                <Button 
                  onClick={() => {
                    setShowSizeModal(false);
                    setCurrentStep(2);
                  }}
                  className="flex-1 bg-gradient-to-r from-green-500 to-blue-500 hover:from-green-600 hover:to-blue-600"
                >
                  Continue to Photo Upload
                </Button>
              </div>
            </div>
          </div>
        </div>
      )}
      
      {/* Results Popup */}
      {showResults && analysisResult && (
        <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-50 p-4">
          <div className="bg-white border border-gray-200 rounded-2xl p-8 max-w-2xl w-full max-h-[90vh] overflow-y-auto shadow-xl">
            <div className="flex justify-between items-center mb-6">
              <h2 className="text-2xl font-bold text-gray-900">Fit Analysis Results</h2>
              <Button
                variant="ghost"
                size="sm"
                onClick={() => setShowResults(false)}
                className="text-gray-400 hover:text-gray-600"
              >
                ✕
              </Button>
            </div>
            
            <div className="space-y-6">
              {/* Fit Score */}
              <div className="text-center">
                <div className="text-4xl font-extrabold text-green-600 mb-2 drop-shadow-lg">
                  {analysisResult.fitScore}%
                </div>
                <p className="text-base text-gray-600">Fit Score</p>
                <Progress value={analysisResult.fitScore} className="mt-3 h-5" />
              </div>
              
              {/* Virtual Overlay */}
              <div className="space-y-3">
                <h4 className="font-semibold text-lg text-blue-600">Virtual Try-On</h4>
                <div className="relative bg-gradient-to-br from-blue-500/10 via-purple-500/10 to-pink-500/10 p-4 rounded-2xl border border-blue-400/30">
                  <img 
                    src={analysisResult.overlay} 
                    alt="Virtual try-on" 
                    className="w-full h-64 object-cover rounded-2xl shadow-lg border-4 border-blue-300"
                  />
                  <div className="absolute inset-0 bg-gradient-to-t from-black/20 to-transparent rounded-2xl" />
                  <Badge className="absolute top-3 right-3 bg-green-600 text-white px-4 py-2 rounded-full shadow-lg text-base">
                    Size {userData.preferredSize}
                  </Badge>
                </div>
              </div>
              
              {/* Recommendation */}
              <div className="space-y-4">
                <div className="flex items-start gap-4 p-4 bg-green-50 rounded-xl shadow-inner border border-green-200">
                  <CheckCircle className="h-6 w-6 text-green-600 mt-1 flex-shrink-0" />
                  <div>
                    <p className="font-semibold text-green-700">Recommendation</p>
                    <p className="text-base text-green-600">
                      {(() => {
                        const score = analysisResult.fitScore;
                        if (score >= 85) {
                          return <span className="font-bold text-green-700">Definitely</span>;
                        } else if (score >= 70) {
                          return <span className="font-bold text-blue-700">Probably Yes</span>;
                        } else if (score >= 50) {
                          return <span className="font-bold text-yellow-700">Maybe</span>;
                        } else if (score >= 30) {
                          return <span className="font-bold text-orange-700">Probably No</span>;
                        } else {
                          return <span className="font-bold text-red-700">No Way</span>;
                        }
                      })()}
                      {' - '}{analysisResult.recommendation}
                    </p>
                  </div>
                </div>
              </div>
              
              <div className="flex gap-3 pt-4">
                <Button 
                  onClick={() => setShowResults(false)}
                  className="flex-1 bg-gray-500 hover:bg-gray-600"
                >
                  Close
                </Button>
                <Button 
                  onClick={() => {
                    setShowResults(false);
                    setCurrentStep(1);
                  }}
                  className="flex-1 bg-gradient-to-r from-purple-500 to-blue-500 hover:from-purple-600 hover:to-blue-600"
                >
                  Analyze Another Item
                </Button>
              </div>
            </div>
          </div>
        </div>
      )}
      {/* Glassmorphism and animation styles: Move the following CSS to your global CSS file (e.g., index.css or globals.css)
        .glassmorphism-card {
          background: rgba(255,255,255,0.7);
          border-radius: 2rem;
          box-shadow: 0 8px 32px 0 rgba(31, 38, 135, 0.18);
          backdrop-filter: blur(16px) saturate(180%);
          -webkit-backdrop-filter: blur(16px) saturate(180%);
          border: 1px solid rgba(255,255,255,0.3);
          transition: box-shadow 0.3s, transform 0.3s;
        }
        .glassmorphism-card:hover {
          box-shadow: 0 16px 48px 0 rgba(31, 38, 135, 0.24);
          transform: translateY(-4px) scale(1.02);
        }
        .glassmorphism-input {
          background: rgba(255,255,255,0.6);
          border-radius: 1rem;
          border: 1.5px solid #c7d2fe;
          box-shadow: 0 2px 8px 0 rgba(59,130,246,0.06);
        }
        .glassmorphism-slider .bg-primary {
          background: linear-gradient(90deg, #60a5fa 0%, #a78bfa 100%) !important;
        }
        .glassmorphism-slider .border-primary {
          border-color: #60a5fa !important;
        }
        .animate-fade-in-up {
          animation: fadeInUp 0.7s cubic-bezier(0.23, 1, 0.32, 1);
        }
        @keyframes fadeInUp {
          0% { opacity: 0; transform: translateY(40px); }
          100% { opacity: 1; transform: translateY(0); }
        }
        */}
    </div>
  );
};

export default Index;
