import { useState, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { useToast } from '@/hooks/use-toast';
import { supabase } from '@/integrations/supabase/client';
import { 
  Plus, 
  Shirt, 
  Star, 
  Calendar, 
  Eye, 
  ThumbsUp, 
  MessageCircle,
  Link as LinkIcon,
  Target,
  CheckCircle,
  AlertCircle,
  X
} from 'lucide-react';
import { TShirtIcon } from '@/components/ui/tshirt-icon';

interface FitAnalysis {
  id: string;
  user_id: string;
  clothing_name: string;
  clothing_url: string;
  preferred_size: string;
  fit_score: number;
  recommendation: string;
  overlay_image: string | null;
  created_at: string;
  likes: number;
  comments: number;
  views: number;
}

const Dashboard = () => {
  const { toast } = useToast();
  const [user, setUser] = useState<any>(null);
  const [fitAnalyses, setFitAnalyses] = useState<FitAnalysis[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [newClothingUrl, setNewClothingUrl] = useState('');
  const [newPreferredSize, setNewPreferredSize] = useState('M');
  const [isCreating, setIsCreating] = useState(false);

  const fetchUserAnalyses = async (userId: string) => {
    try {
      const { data, error } = await supabase
        .from('fit_analyses')
        .select('*')
        .eq('user_id', userId)
        .order('created_at', { ascending: false });

      if (error) {
        console.error('Error fetching analyses:', error);
        toast({
          title: "Error",
          description: "Failed to load your fit analyses",
          variant: "destructive"
        });
        return;
      }

      setFitAnalyses(data || []);
    } catch (error) {
      console.error('Error fetching analyses:', error);
      toast({
        title: "Error",
        description: "Failed to load your fit analyses",
        variant: "destructive"
      });
    }
  };

  useEffect(() => {
    const checkUser = async () => {
      // First, check if there's a session in the URL (magic link)
      const { data: { session } } = await supabase.auth.getSession();
      
      if (session?.user) {
        setUser(session.user);
        await fetchUserAnalyses(session.user.id);
        setIsLoading(false);
        return;
      }

      // If no session, set up auth state listener
      const { data: { subscription } } = supabase.auth.onAuthStateChange(async (event, session) => {
        if (event === 'SIGNED_IN' && session) {
          setUser(session.user);
          await fetchUserAnalyses(session.user.id);
        } else if (event === 'SIGNED_OUT') {
          setUser(null);
          setFitAnalyses([]);
        }
        setIsLoading(false);
      });

      // Also try to get current user as fallback
      const { data: { user }, error } = await supabase.auth.getUser();
      if (user) {
        setUser(user);
        await fetchUserAnalyses(user.id);
      }
      setIsLoading(false);

      return () => subscription.unsubscribe();
    };
    
    checkUser();
  }, []);

  const getRecommendationColor = (recommendation: string) => {
    if (recommendation.includes('Definitely')) return 'bg-green-100 text-green-800 border-green-200';
    if (recommendation.includes('Probably Yes')) return 'bg-blue-100 text-blue-800 border-blue-200';
    if (recommendation.includes('Maybe')) return 'bg-yellow-100 text-yellow-800 border-yellow-200';
    if (recommendation.includes('Probably No')) return 'bg-orange-100 text-orange-800 border-orange-200';
    return 'bg-red-100 text-red-800 border-red-200';
  };

  const getRecommendationIcon = (recommendation: string) => {
    if (recommendation.includes('Definitely')) return <CheckCircle className="h-4 w-4" />;
    if (recommendation.includes('Probably Yes')) return <CheckCircle className="h-4 w-4" />;
    if (recommendation.includes('Maybe')) return <AlertCircle className="h-4 w-4" />;
    if (recommendation.includes('Probably No')) return <AlertCircle className="h-4 w-4" />;
    return <X className="h-4 w-4" />;
  };

  const handleCreateNew = async () => {
    if (!newClothingUrl.trim()) {
      toast({
        title: "URL Required",
        description: "Please enter a clothing item URL",
        variant: "destructive"
      });
      return;
    }

    if (!user) {
      toast({
        title: "Authentication Required",
        description: "Please sign in to create analyses",
        variant: "destructive"
      });
      return;
    }

    setIsCreating(true);
    try {
      // Extract clothing name from URL (basic implementation)
      const url = new URL(newClothingUrl);
      const clothingName = url.hostname.replace('www.', '').split('.')[0] + ' Item';
      
      // Create new analysis record
      const { data, error } = await supabase
        .from('fit_analyses')
        .insert({
          user_id: user.id,
          clothing_name: clothingName,
          clothing_url: newClothingUrl,
          preferred_size: newPreferredSize,
          fit_score: Math.floor(Math.random() * 40) + 60, // Random score between 60-100 for demo
          recommendation: 'Analysis in progress...',
          overlay_image: null,
          likes: 0,
          comments: 0,
          views: 0
        })
        .select()
        .single();

      if (error) {
        throw error;
      }

      // Refresh the analyses list
      await fetchUserAnalyses(user.id);
      
      toast({
        title: "Analysis Created",
        description: "Your new fit analysis has been added to your dashboard!",
      });
      
      setShowCreateModal(false);
      setNewClothingUrl('');
      setNewPreferredSize('M');
    } catch (error) {
      console.error('Error creating analysis:', error);
      toast({
        title: "Analysis Failed",
        description: "Failed to create the analysis. Please try again.",
        variant: "destructive"
      });
    } finally {
      setIsCreating(false);
    }
  };

  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric',
      year: 'numeric'
    });
  };

  if (isLoading) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-4 border-blue-500 border-t-transparent mx-auto mb-4"></div>
          <p className="text-gray-600">Loading your fit analyses...</p>
        </div>
      </div>
    );
  }

  if (!user) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="text-center">
          <h2 className="text-2xl font-bold text-gray-900 mb-4">Please Sign In</h2>
          <p className="text-gray-600">You need to be signed in to view your dashboard.</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <header className="bg-white border-b border-gray-200">
        <div className="container mx-auto px-4 py-6">
          <div className="flex justify-between items-center">
            <div className="flex items-center">
              <TShirtIcon className="h-8 w-8 text-purple-600 mr-3" />
              <span className="text-2xl font-bold bg-gradient-to-r from-purple-600 via-blue-600 to-pink-600 bg-clip-text text-transparent">
                Fits4Me Dashboard
              </span>
            </div>
            <Button 
              onClick={() => setShowCreateModal(true)}
              className="bg-gradient-to-r from-purple-600 to-blue-600 hover:from-purple-700 hover:to-blue-700 text-white rounded-2xl px-6 py-2"
            >
              <Plus className="h-5 w-5 mr-2" />
              Create New Analysis
            </Button>
          </div>
        </div>
      </header>

      {/* Main Content */}
      <div className="container mx-auto px-4 py-8">
        <div className="mb-8">
          <h1 className="text-3xl font-bold text-gray-900 mb-2">Your Fit Analyses</h1>
          <p className="text-gray-600">Track your past clothing fit recommendations and create new analyses</p>
        </div>

        {/* Grid of Fit Analyses */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {fitAnalyses.map((analysis) => (
            <Card key={analysis.id} className="bg-white border border-gray-200 rounded-3xl shadow-lg hover:shadow-xl transition-shadow duration-300">
              <CardHeader className="pb-3">
                <div className="flex justify-between items-start mb-2">
                  <CardTitle className="text-lg font-semibold text-gray-900 line-clamp-2">
                    {analysis.clothing_name}
                  </CardTitle>
                  <Badge className={`px-2 py-1 rounded-full text-xs font-medium border ${getRecommendationColor(analysis.recommendation)}`}>
                    <div className="flex items-center gap-1">
                      {getRecommendationIcon(analysis.recommendation)}
                      {analysis.preferred_size}
                    </div>
                  </Badge>
                </div>
                <div className="flex items-center gap-4 text-sm text-gray-500">
                  <div className="flex items-center gap-1">
                    <Calendar className="h-4 w-4" />
                    {formatDate(analysis.created_at)}
                  </div>
                  <div className="flex items-center gap-1">
                    <Target className="h-4 w-4" />
                    {analysis.fit_score}%
                  </div>
                </div>
              </CardHeader>
              
              <CardContent className="pt-0">
                {/* Virtual Try-On Preview */}
                <div className="relative mb-4 rounded-2xl overflow-hidden bg-gray-100 h-32">
                  <img 
                    src={analysis.overlay_image || 'https://via.placeholder.com/300x200/f3f4f6/9ca3af?text=Virtual+Try-On'} 
                    alt="Virtual try-on" 
                    className="w-full h-full object-cover"
                    onError={(e) => {
                      e.currentTarget.src = 'https://via.placeholder.com/300x200/f3f4f6/9ca3af?text=Virtual+Try-On';
                    }}
                  />
                  <div className="absolute inset-0 bg-gradient-to-t from-black/20 to-transparent" />
                  <div className="absolute bottom-2 left-2">
                    <div className="flex items-center gap-1 bg-white/90 backdrop-blur-sm px-2 py-1 rounded-full">
                      <Star className="h-3 w-3 text-yellow-500 fill-current" />
                      <span className="text-xs font-medium text-gray-900">{analysis.fit_score}%</span>
                    </div>
                  </div>
                </div>

                {/* Recommendation */}
                <div className="mb-4">
                  <p className="text-sm text-gray-700 line-clamp-2">
                    {analysis.recommendation}
                  </p>
                </div>

                {/* Interaction Stats */}
                <div className="flex items-center justify-between text-xs text-gray-500 border-t border-gray-100 pt-3">
                  <div className="flex items-center gap-4">
                    <div className="flex items-center gap-1">
                      <ThumbsUp className="h-3 w-3" />
                      {analysis.likes}
                    </div>
                    <div className="flex items-center gap-1">
                      <MessageCircle className="h-3 w-3" />
                      {analysis.comments}
                    </div>
                    <div className="flex items-center gap-1">
                      <Eye className="h-3 w-3" />
                      {analysis.views}
                    </div>
                  </div>
                  <Button 
                    variant="outline" 
                    size="sm"
                    className="text-xs px-3 py-1 rounded-xl border-gray-200 hover:bg-gray-50"
                  >
                    View Details
                  </Button>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>

        {fitAnalyses.length === 0 && (
          <div className="text-center py-12">
            <TShirtIcon className="h-16 w-16 text-gray-400 mx-auto mb-4" />
            <h3 className="text-xl font-semibold text-gray-900 mb-2">No Fit Analyses Yet</h3>
            <p className="text-gray-600 mb-6">Start by creating your first fit analysis to see recommendations here.</p>
            <Button 
              onClick={() => setShowCreateModal(true)}
              className="bg-gradient-to-r from-purple-600 to-blue-600 hover:from-purple-700 hover:to-blue-700 text-white rounded-2xl px-6 py-3"
            >
              <Plus className="h-5 w-5 mr-2" />
              Create Your First Analysis
            </Button>
          </div>
        )}
      </div>

      {/* Create New Analysis Modal */}
      {showCreateModal && (
        <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-50 p-4">
          <div className="bg-white border border-gray-200 rounded-3xl p-8 max-w-md w-full shadow-xl">
            <div className="flex justify-between items-center mb-6">
              <h2 className="text-2xl font-bold text-gray-900">
                Create New Analysis
              </h2>
              <Button
                variant="ghost"
                size="sm"
                onClick={() => setShowCreateModal(false)}
                className="text-gray-400 hover:text-gray-600 rounded-xl"
              >
                ✕
              </Button>
            </div>
            
            <div className="space-y-4">
              <div>
                <Label htmlFor="clothing-url" className="text-gray-700">Clothing Item URL</Label>
                <Input
                  id="clothing-url"
                  type="url"
                  placeholder="https://www.amazon.com/..."
                  value={newClothingUrl}
                  onChange={(e) => setNewClothingUrl(e.target.value)}
                  className="mt-2 bg-white border-gray-300 text-gray-900 placeholder:text-gray-500 rounded-2xl"
                />
              </div>
              
              <div>
                <Label htmlFor="preferred-size" className="text-gray-700">Preferred Size</Label>
                <select
                  id="preferred-size"
                  value={newPreferredSize}
                  onChange={(e) => setNewPreferredSize(e.target.value)}
                  className="mt-2 w-full bg-white border border-gray-300 text-gray-900 rounded-2xl px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                >
                  <option value="XS">XS</option>
                  <option value="S">S</option>
                  <option value="M">M</option>
                  <option value="L">L</option>
                  <option value="XL">XL</option>
                  <option value="XXL">XXL</option>
                </select>
              </div>

              <div className="bg-blue-50 border border-blue-200 rounded-2xl p-4">
                <div className="flex items-center gap-2 mb-2">
                  <CheckCircle className="h-4 w-4 text-blue-600" />
                  <span className="text-sm font-medium text-blue-800">Using Stored Photo</span>
                </div>
                <p className="text-xs text-blue-700">
                  We'll use your previously uploaded photo for this analysis. You can upload a new photo during the analysis process if needed.
                </p>
              </div>
              
              <Button 
                onClick={handleCreateNew}
                disabled={isCreating}
                className="w-full bg-gradient-to-r from-purple-600 to-blue-600 hover:from-purple-700 hover:to-blue-700 text-lg py-3 rounded-2xl"
              >
                {isCreating ? (
                  <>
                    <div className="animate-spin rounded-full h-5 w-5 border-2 border-white border-t-transparent mr-2" />
                    Analyzing...
                  </>
                ) : (
                  <>
                    <LinkIcon className="h-5 w-5 mr-2" />
                    Start Analysis
                  </>
                )}
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default Dashboard; 