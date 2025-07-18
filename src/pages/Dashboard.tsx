import { useState, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { useToast } from '@/hooks/use-toast';
import { supabase } from '@/integrations/supabase/client';
import { useNavigate } from 'react-router-dom';
import { 
  Plus, 
  Shirt, 
  Star, 
  Calendar, 
  Eye, 
  ThumbsUp, 
  MessageCircle,
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
  const navigate = useNavigate();

  const fetchUserAnalyses = async (userId: string) => {
    try {
      const { data, error } = await supabase
        .from('fit_analyses')
        .select('*')
        .eq('user_id', userId)
        .order('created_at', { ascending: false });

      if (error) {
        console.error('Error fetching analyses:', error);
        // Only show error toast for actual database errors, not when user has no analyses
        if (error.code !== 'PGRST116') { // PGRST116 is "not found" - normal for new users
          toast({
            title: "Error",
            description: `Failed to load your fit analyses: ${error.message || error}`,
            variant: "destructive"
          });
        }
        return;
      }

      setFitAnalyses(data || []);
    } catch (error: any) {
      console.error('Error fetching analyses:', error);
      // Only show error toast for actual errors, not when user has no analyses
      toast({
        title: "Error",
        description: `Failed to load your fit analyses: ${error.message || error}`,
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
    if (!user) {
      toast({
        title: "Authentication Required",
        description: "Please sign in to create analyses",
        variant: "destructive"
      });
      return;
    }

    navigate('/app');
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
    <div className="min-h-screen bg-gray-50 animate-fade-in">
      {/* Header */}
      <header className="bg-white border-b border-gray-200 animate-slide-down">
        <div className="container mx-auto px-4 py-6">
          <div className="flex justify-between items-center">
            <div className="flex items-center">
              <TShirtIcon className="h-8 w-8 text-purple-600 mr-3" />
              <span className="text-2xl font-bold bg-gradient-to-r from-purple-600 via-blue-600 to-pink-600 bg-clip-text text-transparent">
                Fits4Me Dashboard
              </span>
            </div>
            <div className="flex items-center gap-3">
              <Button 
                onClick={() => navigate('/wardrobe')}
                variant="outline"
                className="bg-white border-gray-300 text-gray-700 hover:bg-gray-50 rounded-2xl px-6 py-2 transition-all duration-300"
              >
                <Shirt className="h-5 w-5 mr-2" />
                My Wardrobe
              </Button>
              <Button 
                onClick={handleCreateNew}
                className="bg-gradient-to-r from-purple-600 to-blue-600 hover:from-purple-700 hover:to-blue-700 text-white rounded-2xl px-6 py-2 transition-all duration-300 hover:scale-105"
              >
                <Plus className="h-5 w-5 mr-2" />
                Create New Analysis
              </Button>
            </div>
          </div>
        </div>
      </header>

      {/* Main Content */}
      <div className="container mx-auto px-4 py-8 animate-fade-in-up">
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
            <h3 className="text-xl font-semibold text-gray-900 mb-2">No Fit Analyses Yet</h3>
            <p className="text-gray-600 mb-6">Start by creating your first fit analysis to see recommendations here.</p>
            <Button 
              onClick={handleCreateNew}
              className="bg-gradient-to-r from-purple-600 to-blue-600 hover:from-purple-700 hover:to-blue-700 text-white rounded-2xl px-6 py-3"
            >
              <Plus className="h-5 w-5 mr-2" />
              Create Your First Analysis
            </Button>
          </div>
        )}
      </div>
    </div>
  );
};

export default Dashboard; 