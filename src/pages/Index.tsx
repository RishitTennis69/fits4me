
import { useState } from 'react';
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
  image: string;
  sizeChart?: Record<string, Record<string, string>>;
}

interface UserData {
  photo: string;
  height: number;
  weight: number;
  preferredSize: string;
}

const Index = () => {
  const { toast } = useToast();
  const [clothingUrl, setClothingUrl] = useState('');
  const [clothingData, setClothingData] = useState<ClothingData | null>(null);
  const [userData, setUserData] = useState<UserData>({
    photo: '',
    height: 170,
    weight: 70,
    preferredSize: 'M'
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
  const uploadInputRef = React.useRef<HTMLInputElement>(null);
  const cameraInputRef = React.useRef<HTMLInputElement>(null);

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
        image: scrapedData.images?.[0] || "/placeholder.svg",
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
      // Show clothing preview immediately after scraping, before moving to step 2
      // (step 1 card remains, but clothingData is set, so preview can be shown)
      setTimeout(() => {
        setCurrentStep(2);
      }, 5000);
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
      reader.onload = (e) => {
        setUserData(prev => ({ ...prev, photo: e.target?.result as string }));
        setCurrentStep(3);
      };
      reader.readAsDataURL(file);
    }
  };

  const handleAnalyze = async () => {
    if (!clothingData || !userData.photo) {
      toast({
        title: "Missing Data",
        description: "Please complete all steps before analyzing",
        variant: "destructive"
      });
      return;
    }

    setIsAnalyzing(true);
    
    try {
      // Call Supabase edge function for AI fit analysis
      const { data, error } = await supabase.functions.invoke('analyze-fit', {
        body: { 
          userPhoto: userData.photo,
          clothingData: clothingData,
          userData: userData
        }
      });

      if (error) {
        throw new Error(error.message);
      }

      if (!data.success) {
        throw new Error(data.error || 'Failed to analyze fit');
      }

      const analysis = data.analysis;
      setAnalysisResult({
        fitScore: analysis.fitScore,
        recommendation: analysis.recommendation,
        sizeAdvice: analysis.sizeAdvice,
        overlay: userData.photo // For now, show original photo - future enhancement could generate actual overlay
      });
      
      setCurrentStep(4);
      
      toast({
        title: "Analysis Complete",
        description: "Your AI-powered fit analysis is ready!"
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
    }
  };

  return (
    <div className="min-h-screen bg-white flex items-center justify-center">
      <div className="container mx-auto px-4 py-12 flex flex-col items-center">
        <div className="text-center mb-12 w-full max-w-2xl">
          <h1 className="text-5xl font-bold leading-normal bg-gradient-to-r from-purple-600 via-blue-500 to-pink-500 bg-clip-text text-transparent mb-4 drop-shadow-lg">
            Virtual Fitting Room
          </h1>
          <p className="text-xl text-gray-700 font-medium max-w-2xl mx-auto">
            Try on clothes virtually with AI-powered size recommendations
          </p>
        </div>

        {/* Progress Steps */}
        <div className="flex justify-center mb-12">
          <div className="flex items-center space-x-6">
            {[1, 2, 3, 4].map((step) => (
              <div key={step} className="flex items-center">
                <div
                  className={`w-10 h-10 rounded-full flex items-center justify-center text-lg font-bold shadow-lg transition-colors duration-300 border-2 cursor-pointer ${
                    currentStep >= step 
                      ? 'bg-gradient-to-br from-blue-500 to-purple-500 text-white border-blue-400 scale-110' 
                      : 'bg-white/60 text-gray-400 border-gray-200 cursor-default'
                  }`}
                  onClick={() => {
                    if (step < currentStep) setCurrentStep(step);
                  }}
                  style={{ pointerEvents: step < currentStep ? 'auto' : 'none', opacity: step < currentStep ? 1 : 0.7 }}
                  title={step < currentStep ? `Go back to step ${step}` : undefined}
                >
                  {step}
                </div>
                {step < 4 && (
                  <div className={`w-16 h-1 mx-2 rounded-full transition-colors duration-300 ${
                    currentStep > step ? 'bg-gradient-to-r from-blue-400 to-purple-400' : 'bg-gray-200'
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
              {/* Step 1: Clothing URL */}
              <Card className="glassmorphism-card p-10 text-lg">
                <CardHeader>
                  <CardTitle className="flex items-center gap-3 text-blue-700">
                    <Link className="h-6 w-6 text-blue-500" />
                    Step 1: Enter Clothing URL
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-6">
                  <div>
                    <Label htmlFor="clothing-url" className="text-base">Clothing Item URL</Label>
                    <Input
                      id="clothing-url"
                      placeholder="https://www.amazon.com/..."
                      value={clothingUrl}
                      onChange={(e) => setClothingUrl(e.target.value)}
                      className="mt-2 glassmorphism-input"
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
                  {/* Show clothing preview after scraping, before moving to step 2 */}
                  {clothingData && !isAnalyzing && (
                    <div className="mt-8 animate-fade-in-up">
                      <Card className="glassmorphism-card">
                        <CardHeader>
                          <CardTitle className="flex items-center gap-3 text-blue-700">
                            <Shirt className="h-6 w-6 text-blue-500" />
                            Clothing Item
                          </CardTitle>
                        </CardHeader>
                        <CardContent>
                          <div className="space-y-6">
                            <img src={clothingData.image} alt={clothingData.name} className="w-full h-56 object-cover rounded-2xl bg-gray-100 shadow-lg border-4 border-blue-100" />
                            <div>
                              <h3 className="font-semibold text-xl text-blue-800">{clothingData.name}</h3>
                              <p className="text-2xl font-bold text-green-600">{clothingData.price}</p>
                              <div className="flex gap-2 mt-3">
                                {clothingData.sizes.map(size => (
                                  <Badge key={size} variant="outline" className="text-sm px-3 py-1 rounded-full bg-white/70 border-blue-200 text-blue-700 font-semibold shadow-sm">
                                    {size}
                                  </Badge>
                                ))}
                              </div>
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
              <Card className="glassmorphism-card p-10 text-lg">
                <CardHeader>
                  <CardTitle className="flex items-center gap-3 text-green-700">
                    <Upload className="h-6 w-6 text-green-500" />
                    Step 2: Upload Your Photo
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-6">
                  <div className="border-2 border-dashed border-gray-300 rounded-2xl p-8 text-center hover:border-blue-400 transition-colors bg-white/40 backdrop-blur-md shadow-inner flex flex-col items-center gap-4">
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
                        className="px-6 py-3 text-lg"
                        onClick={() => uploadInputRef.current?.click()}
                        disabled={currentStep < 2}
                      >
                        Upload Photo
                      </Button>
                      <Button
                        type="button"
                        variant="outline"
                        className="px-6 py-3 text-lg"
                        onClick={() => cameraInputRef.current?.click()}
                        disabled={currentStep < 2}
                      >
                        Take Photo
                      </Button>
                    </div>
                    {userData.photo ? (
                      <div className="space-y-2 mt-4">
                        <img src={userData.photo} alt="Your photo" className="max-h-32 mx-auto rounded-xl shadow-lg border-4 border-green-200" />
                        <p className="text-base text-green-700 font-semibold">Photo uploaded!</p>
                      </div>
                    ) : (
                      <div className="space-y-2 mt-4">
                        <Upload className="h-10 w-10 mx-auto text-gray-400" />
                        <p className="text-gray-600 font-medium">Upload or take a photo to continue</p>
                        <p className="text-xs text-gray-400">PNG, JPG up to 10MB</p>
                      </div>
                    )}
                  </div>
                </CardContent>
              </Card>
            </div>
          )}
          {currentStep === 3 && (
            <div className="w-full max-w-2xl animate-fade-in-up">
              {/* Step 3: Measurements */}
              <Card className="glassmorphism-card p-10 text-lg">
                <CardHeader>
                  <CardTitle className="flex items-center gap-3 text-purple-700">
                    <User className="h-6 w-6 text-purple-500" />
                    Step 3: Your Measurements
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-8">
                  <div>
                    <Label className="text-base">Height: <span className="font-bold text-blue-700">{userData.height} cm</span></Label>
                    <Slider
                      value={[userData.height]}
                      onValueChange={(value) => setUserData(prev => ({ ...prev, height: value[0] }))}
                      max={220}
                      min={140}
                      step={1}
                      className="mt-3 glassmorphism-slider"
                      disabled={currentStep < 3}
                    />
                  </div>
                  <div>
                    <Label className="text-base">Weight: <span className="font-bold text-blue-700">{userData.weight} kg</span></Label>
                    <Slider
                      value={[userData.weight]}
                      onValueChange={(value) => setUserData(prev => ({ ...prev, weight: value[0] }))}
                      max={150}
                      min={40}
                      step={1}
                      className="mt-3 glassmorphism-slider"
                      disabled={currentStep < 3}
                    />
                  </div>
                  <div>
                    <Label className="text-base">Preferred Size</Label>
                    <div className="flex gap-3 mt-3">
                      {clothingData?.sizes.map(size => (
                        <Button
                          key={size}
                          variant={userData.preferredSize === size ? "default" : "outline"}
                          size="sm"
                          onClick={() => setUserData(prev => ({ ...prev, preferredSize: size }))}
                          disabled={currentStep < 3}
                          className={`rounded-full px-4 py-2 font-semibold transition-all duration-200 ${userData.preferredSize === size ? 'bg-gradient-to-r from-blue-500 to-purple-500 text-white shadow-lg scale-105' : 'bg-white/60 text-blue-700 border-blue-200 hover:bg-blue-50'}`}
                        >
                          {size}
                        </Button>
                      ))}
                    </div>
                  </div>
                  {currentStep >= 3 && (
                    <Button 
                      onClick={handleAnalyze}
                      disabled={isAnalyzing}
                      className="w-full bg-gradient-to-r from-green-500 to-blue-500 hover:from-green-600 hover:to-blue-600 text-lg py-3 rounded-xl shadow-xl transition-all duration-300"
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
                  )}
                </CardContent>
              </Card>
            </div>
          )}
          {/* Analysis Progress */}
          {isAnalyzing && (
            <div className="w-full max-w-2xl animate-fade-in-up mt-8">
              <Card className="glassmorphism-card p-10 text-lg">
                <CardHeader>
                  <CardTitle className="text-blue-700">Analyzing Fit...</CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="space-y-6">
                    <Progress value={analyzeProgress} className="w-full h-6 shadow-lg" />
                  </div>
                </CardContent>
              </Card>
            </div>
          )}
          {/* Results */}
          {analysisResult && (
            <div className="w-full max-w-2xl animate-fade-in-up mt-8">
              <Card className="glassmorphism-card p-10 text-lg">
                <CardHeader>
                  <CardTitle className="flex items-center gap-3 text-green-700">
                    <CheckCircle className="h-6 w-6 text-green-600" />
                    Fit Analysis Results
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-8">
                  {/* Fit Score */}
                  <div className="text-center">
                    <div className="text-4xl font-extrabold text-green-600 mb-2 drop-shadow-lg">
                      {analysisResult.fitScore}%
                    </div>
                    <p className="text-base text-gray-600">Fit Score</p>
                    <Progress value={analysisResult.fitScore} className="mt-3 h-5" />
                  </div>
                  <Separator className="my-6" />
                  {/* Virtual Overlay */}
                  <div className="space-y-3">
                    <h4 className="font-semibold text-lg text-blue-700">Virtual Try-On</h4>
                    <div className="relative">
                      <img 
                        src={analysisResult.overlay} 
                        alt="Virtual try-on" 
                        className="w-full h-72 object-cover rounded-2xl shadow-lg border-4 border-blue-100"
                      />
                      <div className="absolute inset-0 bg-gradient-to-t from-black/20 to-transparent rounded-2xl" />
                      <Badge className="absolute top-3 right-3 bg-green-600 text-white px-4 py-2 rounded-full shadow-lg text-base">
                        Size {userData.preferredSize}
                      </Badge>
                    </div>
                  </div>
                  <Separator className="my-6" />
                  {/* Recommendations */}
                  <div className="space-y-4">
                    <div className="flex items-start gap-4 p-4 bg-green-50/80 rounded-xl shadow-inner">
                      <CheckCircle className="h-6 w-6 text-green-600 mt-1 flex-shrink-0" />
                      <div>
                        <p className="font-semibold text-green-800">Recommendation</p>
                        <p className="text-base text-green-700">{analysisResult.recommendation}</p>
                      </div>
                    </div>
                    <div className="flex items-start gap-4 p-4 bg-blue-50/80 rounded-xl shadow-inner">
                      <AlertCircle className="h-6 w-6 text-blue-600 mt-1 flex-shrink-0" />
                      <div>
                        <p className="font-semibold text-blue-800">Size Advice</p>
                        <p className="text-base text-blue-700">{analysisResult.sizeAdvice}</p>
                      </div>
                    </div>
                  </div>
                  <Button className="w-full bg-gradient-to-r from-purple-600 to-pink-600 hover:from-purple-700 hover:to-pink-700 text-lg py-3 rounded-xl shadow-xl mt-6 transition-all duration-300">
                    Shop This Item
                  </Button>
                </CardContent>
              </Card>
            </div>
          )}
        </div>
      </div>
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
