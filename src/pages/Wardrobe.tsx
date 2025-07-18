import React, { useState, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { useToast } from '@/hooks/use-toast';
import { Upload, Plus, Trash2, Camera, ArrowLeft } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { useNavigate } from 'react-router-dom';

interface WardrobeItem {
  id: string;
  name: string;
  category: string;
  color: string;
  size: string;
  photo_url: string;
  ai_analysis?: any;
  created_at: string;
}

const Wardrobe = () => {
  const { toast } = useToast();
  const navigate = useNavigate();
  const [wardrobeItems, setWardrobeItems] = useState<WardrobeItem[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isAddingItem, setIsAddingItem] = useState(false);
  const [newItemPhoto, setNewItemPhoto] = useState('');
  const [newItemData, setNewItemData] = useState({
    name: '',
    category: '',
    color: '',
    size: '',
    sizeType: ''
  });
  const [aiAnalysis, setAiAnalysis] = useState<any>(null);
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const uploadInputRef = React.useRef<HTMLInputElement>(null);
  const cameraInputRef = React.useRef<HTMLInputElement>(null);

  useEffect(() => {
    loadWardrobeItems();
  }, []);

  const loadWardrobeItems = async () => {
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) {
        navigate('/');
        return;
      }

      const { data, error } = await supabase.functions.invoke('wardrobe-management', {
        body: { action: 'get_items' }
      });

      if (error) throw error;

      if (data.success) {
        setWardrobeItems(data.items);
      } else if (data.error) {
        throw new Error(data.error);
      }
    } catch (error: any) {
      console.error('Error loading wardrobe items:', error);
      toast({
        title: "Error",
        description: `Failed to load wardrobe items: ${error.message || error}`,
        variant: "destructive"
      });
    } finally {
      setIsLoading(false);
    }
  };

  // Remove auto-analysis from handlePhotoUpload
  const handlePhotoUpload = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (file) {
      const reader = new FileReader();
      reader.onload = (e) => {
        const photoUrl = e.target?.result as string;
        setNewItemPhoto(photoUrl);
        setAiAnalysis(null); // Reset previous analysis
      };
      reader.readAsDataURL(file);
    }
  };

  // Add manual analysis trigger
  const handleAnalyzePhoto = async () => {
    if (!newItemPhoto) {
      toast({
        title: "Photo Required",
        description: "Please upload a photo before analyzing.",
        variant: "destructive"
      });
      return;
    }
    setIsAnalyzing(true);
    try {
      const { data, error } = await supabase.functions.invoke('wardrobe-management', {
        body: { 
          action: 'analyze_photo',
          itemData: { photoUrl: newItemPhoto }
        }
      });
      if (error) throw error;
      if (data.success && data.analysis) {
        setAiAnalysis(data.analysis);
        setNewItemData(prev => ({
          ...prev,
          name: data.analysis.description || '',
          category: data.analysis.category || '',
          color: data.analysis.color || '',
          size: data.analysis.estimatedSize || ''
        }));
      }
    } catch (error) {
      console.error('Error analyzing photo:', error);
      toast({
        title: "Error",
        description: `Failed to analyze photo: ${error.message || error}`,
        variant: "destructive"
      });
    } finally {
      setIsAnalyzing(false);
    }
  };

  const handleAddItem = async () => {
    if (!newItemPhoto || !newItemData.name || !newItemData.category) {
      toast({
        title: "Missing Information",
        description: "Please provide a photo, name, and category for the item",
        variant: "destructive"
      });
      return;
    }

    try {
      const { data, error } = await supabase.functions.invoke('wardrobe-management', {
        body: {
          action: 'add_item',
          itemData: {
            ...newItemData,
            photoUrl: newItemPhoto,
            analyzeWithAI: true
          }
        }
      });

      if (error) throw error;

      if (data.success) {
        toast({
          title: "Success",
          description: "Item added to your wardrobe"
        });
        // Reset form
        setNewItemPhoto('');
        setNewItemData({ name: '', category: '', color: '', size: '', sizeType: '' });
        setAiAnalysis(null);
        setIsAddingItem(false);
        // Only reload after modal is closed
        setTimeout(() => loadWardrobeItems(), 100);
      }
    } catch (error) {
      console.error('Error adding item:', error);
      toast({
        title: "Error",
        description: "Failed to add item to wardrobe",
        variant: "destructive"
      });
    }
  };

  const handleDeleteItem = async (itemId: string) => {
    try {
      const { data, error } = await supabase.functions.invoke('wardrobe-management', {
        body: { action: 'delete_item', itemId }
      });

      if (error) throw error;

      if (data.success) {
        toast({
          title: "Success",
          description: "Item removed from wardrobe"
        });
        // Only reload after delete
        loadWardrobeItems();
      }
    } catch (error) {
      console.error('Error deleting item:', error);
      toast({
        title: "Error",
        description: "Failed to remove item",
        variant: "destructive"
      });
    }
  };

  const getCategoryColor = (category: string) => {
    const colors: { [key: string]: string } = {
      shirt: 'bg-blue-100 text-blue-800',
      pants: 'bg-green-100 text-green-800',
      dress: 'bg-purple-100 text-purple-800',
      jacket: 'bg-orange-100 text-orange-800',
      sweater: 'bg-red-100 text-red-800',
      skirt: 'bg-pink-100 text-pink-800'
    };
    return colors[category.toLowerCase()] || 'bg-gray-100 text-gray-800';
  };

  if (isLoading) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600 mx-auto"></div>
          <p className="mt-4 text-gray-600">Loading your wardrobe...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50">
      <div className="container mx-auto px-4 py-8">
        {/* Header */}
        <div className="flex items-center justify-between mb-8">
          <div className="flex items-center gap-4">
            <Button
              onClick={() => navigate('/dashboard')}
              variant="ghost"
              className="text-gray-600 hover:text-gray-900"
            >
              <ArrowLeft className="h-5 w-5 mr-2" />
              Back to Dashboard
            </Button>
            <h1 className="text-3xl font-bold text-gray-900">My Wardrobe</h1>
          </div>
          <Button
            onClick={() => setIsAddingItem(true)}
            className="bg-gradient-to-r from-blue-500 to-purple-500 hover:from-blue-600 hover:to-purple-600"
          >
            <Plus className="h-5 w-5 mr-2" />
            Add Item
          </Button>
        </div>

        {/* Add Item Modal */}
        {isAddingItem && (
          <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-50 p-4">
            <div className="bg-white border border-gray-200 rounded-2xl p-8 max-w-md w-full shadow-xl">
              <div className="flex justify-between items-center mb-6">
                <h2 className="text-2xl font-bold text-gray-900">Add to Wardrobe</h2>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => setIsAddingItem(false)}
                  className="text-gray-400 hover:text-gray-600"
                >
                  ✕
                </Button>
              </div>

              <div className="space-y-6">
                {/* Photo Upload */}
                <div>
                  <Label className="text-base text-gray-700 mb-2 block">Item Photo</Label>
                  <div className="border-2 border-dashed border-gray-300 rounded-xl p-6 text-center hover:border-blue-400 transition-colors">
                    <input
                      ref={uploadInputRef}
                      type="file"
                      accept="image/*"
                      onChange={handlePhotoUpload}
                      className="hidden"
                    />
                    <input
                      ref={cameraInputRef}
                      type="file"
                      accept="image/*"
                      capture="environment"
                      onChange={handlePhotoUpload}
                      className="hidden"
                    />
                    
                    {newItemPhoto ? (
                      <div className="space-y-4">
                        <img src={newItemPhoto} alt="Item" className="max-h-32 mx-auto rounded-lg" />
                        <div className="flex gap-2 justify-center">
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => uploadInputRef.current?.click()}
                          >
                            Change Photo
                          </Button>
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => cameraInputRef.current?.click()}
                          >
                            Take New Photo
                          </Button>
                        </div>
                        {/* Analyze Button */}
                        {!aiAnalysis && (
                          <Button
                            onClick={handleAnalyzePhoto}
                            disabled={isAnalyzing}
                            className="w-full bg-gradient-to-r from-blue-500 to-purple-500 hover:from-blue-600 hover:to-purple-600 mt-2"
                          >
                            {isAnalyzing ? (
                              <>
                                <div className="animate-spin rounded-full h-4 w-4 border-2 border-white border-t-transparent mr-2" />
                                Analyzing...
                              </>
                            ) : (
                              'Analyze Photo with AI'
                            )}
                          </Button>
                        )}
                      </div>
                    ) : (
                      <div className="space-y-4">
                        <Upload className="h-12 w-12 mx-auto text-gray-400" />
                        <div className="space-y-2">
                          <p className="text-gray-600">Upload a photo of your clothing item</p>
                          <div className="flex gap-2 justify-center">
                            <Button
                              variant="outline"
                              onClick={() => uploadInputRef.current?.click()}
                            >
                              Upload Photo
                            </Button>
                            <Button
                              variant="outline"
                              onClick={() => cameraInputRef.current?.click()}
                            >
                              Take Photo
                            </Button>
                          </div>
                        </div>
                      </div>
                    )}
                  </div>
                </div>

                {/* AI Analysis Results */}
                {aiAnalysis && (
                  <div className="bg-blue-50 p-4 rounded-lg border border-blue-200">
                    <h4 className="font-semibold text-blue-800 mb-2">AI Analysis</h4>
                    <div className="space-y-1 text-sm text-blue-700">
                      <p><strong>Category:</strong> {aiAnalysis.category}</p>
                      <p><strong>Color:</strong> {aiAnalysis.color}</p>
                      <p><strong>Style:</strong> {aiAnalysis.style}</p>
                      <p><strong>Material:</strong> {aiAnalysis.material}</p>
                      {aiAnalysis.estimatedSize && (
                        <p><strong>Estimated Size:</strong> {aiAnalysis.estimatedSize}</p>
                      )}
                    </div>
                  </div>
                )}

                {/* Item Details Form */}
                <div className="space-y-4">
                  <div>
                    <Label htmlFor="size">Size</Label>
                    <Input
                      id="size"
                      value={newItemData.size}
                      onChange={(e) => setNewItemData(prev => ({ ...prev, size: e.target.value }))}
                      placeholder="e.g., M"
                    />
                  </div>
                  <div>
                    <Label htmlFor="sizeType">Size Type</Label>
                    <select
                      id="sizeType"
                      value={newItemData.sizeType}
                      onChange={(e) => setNewItemData(prev => ({ ...prev, sizeType: e.target.value }))}
                      className="w-full p-2 border border-gray-300 rounded-md"
                    >
                      <option value="">Select size type</option>
                      <option value="youth">Youth</option>
                      <option value="men">Men's</option>
                      <option value="women">Women's</option>
                    </select>
                  </div>
                </div>
                {/* After AI analysis, show category, color, and name fields for review/edit */}
                {aiAnalysis && (
                  <div className="space-y-4 mt-4">
                    <div>
                      <Label htmlFor="name">Item Name</Label>
                      <Input
                        id="name"
                        value={newItemData.name}
                        onChange={(e) => setNewItemData(prev => ({ ...prev, name: e.target.value }))}
                        placeholder="e.g., Blue Denim Jacket"
                      />
                    </div>
                    <div>
                      <Label htmlFor="category">Category</Label>
                      <Input
                        id="category"
                        value={newItemData.category}
                        onChange={(e) => setNewItemData(prev => ({ ...prev, category: e.target.value }))}
                        placeholder="e.g., Shirt, Pants, etc."
                      />
                    </div>
                    <div>
                      <Label htmlFor="color">Color</Label>
                      <Input
                        id="color"
                        value={newItemData.color}
                        onChange={(e) => setNewItemData(prev => ({ ...prev, color: e.target.value }))}
                        placeholder="e.g., Navy Blue"
                      />
                    </div>
                  </div>
                )}

                {/* Action Buttons */}
                <div className="flex gap-3 pt-4">
                  <Button
                    onClick={() => setIsAddingItem(false)}
                    variant="outline"
                    className="flex-1"
                  >
                    Cancel
                  </Button>
                  <Button
                    onClick={handleAddItem}
                    disabled={isAnalyzing}
                    className="flex-1 bg-gradient-to-r from-blue-500 to-purple-500 hover:from-blue-600 hover:to-purple-600"
                  >
                    {isAnalyzing ? (
                      <>
                        <div className="animate-spin rounded-full h-4 w-4 border-2 border-white border-t-transparent mr-2" />
                        Analyzing...
                      </>
                    ) : (
                      'Add to Wardrobe'
                    )}
                  </Button>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Wardrobe Items Grid */}
        {wardrobeItems.length === 0 ? (
          <div className="text-center py-12">
            <div className="max-w-md mx-auto">
              <div className="bg-gray-100 rounded-full w-24 h-24 flex items-center justify-center mx-auto mb-4">
                <Upload className="h-12 w-12 text-gray-400" />
              </div>
              <h3 className="text-xl font-semibold text-gray-900 mb-2">Your wardrobe is empty</h3>
              <p className="text-gray-600 mb-6">
                Add your existing clothing items to try them on with new purchases
              </p>
              <Button
                onClick={() => setIsAddingItem(true)}
                className="bg-gradient-to-r from-blue-500 to-purple-500 hover:from-blue-600 hover:to-purple-600"
              >
                <Plus className="h-5 w-5 mr-2" />
                Add Your First Item
              </Button>
            </div>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {wardrobeItems.map((item) => (
              <Card key={item.id} className="bg-white border-gray-200 shadow-lg hover:shadow-xl transition-shadow">
                <CardHeader className="pb-3">
                  <div className="flex justify-between items-start">
                    <CardTitle className="text-lg font-semibold text-gray-900 line-clamp-2">
                      {item.name}
                    </CardTitle>
                    <Button
                      onClick={() => handleDeleteItem(item.id)}
                      variant="ghost"
                      size="sm"
                      className="text-red-500 hover:text-red-700"
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </div>
                </CardHeader>
                <CardContent>
                  <div className="space-y-4">
                    <img 
                      src={item.photo_url} 
                      alt={item.name} 
                      className="w-full h-48 object-cover rounded-xl bg-gray-100 shadow-lg border-2 border-gray-200" 
                    />
                    <div className="space-y-2">
                      <div className="flex gap-2 flex-wrap">
                        <Badge className={getCategoryColor(item.category)}>
                          {item.category}
                        </Badge>
                        {item.color && (
                          <Badge variant="outline" className="text-gray-600">
                            {item.color}
                          </Badge>
                        )}
                        {item.size && (
                          <Badge variant="outline" className="text-gray-600">
                            Size {item.size}
                          </Badge>
                        )}
                      </div>
                      <p className="text-sm text-gray-500">
                        Added {new Date(item.created_at).toLocaleDateString()}
                      </p>
                    </div>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        )}
      </div>
    </div>
  );
};

export default Wardrobe; 