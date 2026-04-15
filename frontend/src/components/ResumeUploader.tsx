import React, { useState, useRef } from 'react';
import { Upload, X, FileText, CheckCircle, AlertCircle, Cloud, Sparkles } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import AuthStatus from './AuthStatus';

interface ResumeUploaderProps {
  onUploadSuccess?: (data: any) => void;
  onUploadError?: (error: string) => void;
  selectedJobId?: number | string | null;
  className?: string;
}

export const ResumeUploader: React.FC<ResumeUploaderProps> = ({
  onUploadSuccess,
  onUploadError,
  selectedJobId,
  className = ''
}) => {
  const [isDragging, setIsDragging] = useState(false);
  const [isUploading, setIsUploading] = useState(false);
  const [uploadStatus, setUploadStatus] = useState<'idle' | 'success' | 'error'>('idle');
  const [uploadMessage, setUploadMessage] = useState('');
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const allowedTypes = ['.pdf', '.doc', '.docx', '.xls', '.xlsx', '.jpg', '.jpeg', '.png', '.bmp', '.tiff'];
  const maxSize = 10 * 1024 * 1024; // 10MB

  const validateFile = (file: File): string | null => {
    const extension = '.' + file.name.split('.').pop()?.toLowerCase();
    if (!allowedTypes.includes(extension)) {
      return `Invalid file type. Allowed types: ${allowedTypes.join(', ')}`;
    }
    if (file.size > maxSize) {
      return 'File size must be less than 10MB';
    }
    return null;
  };

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(true);
  };

  const handleDragLeave = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
    
    const files = Array.from(e.dataTransfer.files);
    if (files.length > 0) {
      handleFileSelection(files[0]);
    }
  };

  const handleFileSelection = (file: File) => {
    const validationError = validateFile(file);
    if (validationError) {
      setUploadStatus('error');
      setUploadMessage(validationError);
      onUploadError?.(validationError);
      return;
    }
    
    setSelectedFile(file);
    setUploadStatus('idle');
    setUploadMessage('');
  };

  const handleFileInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (files && files.length > 0) {
      handleFileSelection(files[0]);
    }
  };

  const uploadFile = async () => {
    if (!selectedFile) return;

    // Check authentication before upload
    const { isAuthenticated } = await import('@/lib/auth');
    if (!isAuthenticated()) {
      setUploadStatus('error');
      setUploadMessage('Please log in to upload resumes');
      onUploadError?.('Authentication required');
      return;
    }

    setIsUploading(true);
    setUploadStatus('idle');

    try {
      // Import authenticatedFetch dynamically to avoid circular imports
      const { authenticatedFetch } = await import('@/lib/api');
      
      const formData = new FormData();
      formData.append('resume', selectedFile);

      if (selectedJobId !== undefined && selectedJobId !== null && String(selectedJobId).trim() !== '') {
        formData.append('job_id', String(selectedJobId));
      }

      const response = await authenticatedFetch('/api/resumes/upload', {
        method: 'POST',
        body: formData
      });

      const result = await response.json();

      if (response.ok) {
        setUploadStatus('success');
        setUploadMessage('Resume uploaded successfully! 🎉');
        setSelectedFile(null);
        onUploadSuccess?.(result);
        
        // Reset file input
        if (fileInputRef.current) {
          fileInputRef.current.value = '';
        }
      } else {
        // Handle specific error cases
        if (response.status === 401) {
          setUploadStatus('error');
          setUploadMessage('Session expired. Please log in again.');
          // Redirect to login after a delay
          setTimeout(() => {
            if (window.location.pathname !== '/login') {
              window.location.href = '/login';
            }
          }, 2000);
        } else {
          throw new Error(result.message || 'Upload failed');
        }
      }
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Upload failed';
      setUploadStatus('error');
      setUploadMessage(errorMessage);
      onUploadError?.(errorMessage);
    } finally {
      setIsUploading(false);
    }
  };

  const clearFile = () => {
    setSelectedFile(null);
    setUploadStatus('idle');
    setUploadMessage('');
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  };

  return (
    <Card className={`w-full bg-card/95 backdrop-blur-sm ${className}`}>
      <CardContent className="p-8">
        <div className="space-y-6">
          {/* Authentication Status */}
          <AuthStatus />

          {/* Header */}
          <div className="text-center space-y-2">
            <div className="relative inline-block">
              <Cloud className="h-12 w-12 text-blue-500 mx-auto" />
              <Sparkles className="h-4 w-4 text-yellow-400 absolute -top-1 -right-1 animate-pulse" />
            </div>
            <h3 className="text-xl font-bold text-foreground">Upload Your Resume</h3>
            <p className="text-muted-foreground">Share your professional story with us</p>
          </div>

          {/* Upload Area */}
          <div
            className={`relative border-2 border-dashed rounded-xl p-8 text-center transition-all duration-300 ${
              isDragging
                ? 'border-blue-400 bg-gradient-to-br from-blue-50 to-indigo-50 scale-105 shadow-lg'
                : selectedFile
                ? 'border-green-400 bg-gradient-to-br from-green-50 to-emerald-50 shadow-md'
                : 'border-gray-300 hover:border-blue-300 hover:bg-gradient-to-br hover:from-gray-50 hover:to-blue-50 hover:shadow-md'
            }`}
            onDragOver={handleDragOver}
            onDragLeave={handleDragLeave}
            onDrop={handleDrop}
          >
            {/* Animated background pattern */}
            <div className="absolute inset-0 opacity-5">
              <Card className="w-full max-w-md mx-auto bg-gradient-to-br from-white via-blue-50/30 to-purple-50/30 border-2 border-dashed border-blue-200 hover:border-blue-300 transition-all duration-300 shadow-lg backdrop-blur-sm">
                <CardContent className="p-8">
                  {/* Authentication Status */}
                  <div className="mb-4">
                    <AuthStatus />
                  </div>

                  {/* Header with animated sparkles */}
                  <div className="text-center mb-6 relative">
                    <div className="absolute -top-2 -right-2 text-yellow-400 animate-pulse">
                      <Sparkles className="h-4 w-4" />
                    </div>
                    <div className="absolute -bottom-1 -left-2 text-blue-400 animate-pulse delay-300">
                      <Sparkles className="h-3 w-3" />
                    </div>
                    <Cloud className="h-12 w-12 mx-auto mb-3 text-blue-500 animate-bounce" />
                    <h3 className="text-xl font-bold bg-gradient-to-r from-blue-600 to-purple-600 bg-clip-text text-transparent">
                      Upload Resume
                    </h3>
                    <p className="text-sm text-muted-foreground mt-1">
                      Drag & drop or click to select
                    </p>
                  </div>

                  {selectedFile ? (
                    <div className="relative space-y-4">
                      <div className="relative inline-block">
                        <FileText className="mx-auto h-16 w-16 text-green-600" />
                        <CheckCircle className="absolute -top-2 -right-2 h-6 w-6 text-green-500 bg-card rounded-full" />
                      </div>
                      <div className="space-y-2">
                        <div className="flex items-center justify-center gap-3">
                          <span className="text-lg font-semibold text-green-700 truncate max-w-xs">
                            {selectedFile.name}
                          </span>
                          <button
                            onClick={clearFile}
                            className="text-red-500 hover:text-red-700 hover:bg-red-50 rounded-full p-1 transition-colors"
                          >
                            <X size={18} />
                          </button>
                        </div>
                        <div className="flex items-center justify-center gap-4 text-sm text-muted-foreground">
                          <span className="bg-green-100 px-3 py-1 rounded-full">
                            {(selectedFile.size / 1024 / 1024).toFixed(2)} MB
                          </span>
                          <span className="bg-blue-100 px-3 py-1 rounded-full">
                            Ready to upload
                          </span>
                        </div>
                      </div>
                    </div>
                  ) : (
                    <div className="relative space-y-4">
                      <div className="relative inline-block">
                        <Upload className={`mx-auto h-16 w-16 transition-all duration-300 ${
                          isDragging ? 'text-blue-500 scale-110' : 'text-gray-400'
                        }`} />
                        {isDragging && (
                          <div className="absolute inset-0 animate-ping">
                            <Upload className="h-16 w-16 text-blue-400 opacity-75" />
                          </div>
                        )}
                      </div>
                      <div className="space-y-3">
                        <div>
                          <p className="text-lg font-semibold text-gray-800 mb-2">
                            {isDragging ? 'Drop it like it\'s hot! 🔥' : 'Drag & drop your resume here'}
                          </p>
                          <p className="text-muted-foreground">
                            or{' '}
                            <button
                              onClick={() => fileInputRef.current?.click()}
                              className="text-blue-600 hover:text-blue-700 font-semibold underline decoration-2 underline-offset-2 hover:decoration-blue-700 transition-colors"
                            >
                              browse files
                            </button>
                          </p>
                        </div>
                        <div className="flex flex-wrap justify-center gap-2 text-xs text-muted-foreground">
                          {['PDF', 'DOC', 'DOCX', 'XLS', 'XLSX', 'JPG', 'PNG'].map((type) => (
                            <span key={type} className="bg-gray-100 px-2 py-1 rounded-md font-medium">
                              {type}
                            </span>
                          ))}
                        </div>
                        <p className="text-xs text-muted-foreground">
                          Maximum file size: 10MB
                        </p>
                      </div>
                    </div>
                  )}
                </CardContent>
              </Card>
            </div>
            
            {selectedFile ? (
              <div className="relative space-y-4">
                <div className="relative inline-block">
                  <FileText className="mx-auto h-16 w-16 text-green-600" />
                  <CheckCircle className="absolute -top-2 -right-2 h-6 w-6 text-green-500 bg-card rounded-full" />
                </div>
                <div className="space-y-2">
                  <div className="flex items-center justify-center gap-3">
                    <span className="text-lg font-semibold text-green-700 truncate max-w-xs">
                      {selectedFile.name}
                    </span>
                    <button
                      onClick={clearFile}
                      className="text-red-500 hover:text-red-700 hover:bg-red-50 rounded-full p-1 transition-colors"
                    >
                      <X size={18} />
                    </button>
                  </div>
                  <div className="flex items-center justify-center gap-4 text-sm text-muted-foreground">
                    <span className="bg-green-100 px-3 py-1 rounded-full">
                      {(selectedFile.size / 1024 / 1024).toFixed(2)} MB
                    </span>
                    <span className="bg-blue-100 px-3 py-1 rounded-full">
                      Ready to upload
                    </span>
                  </div>
                </div>
              </div>
            ) : (
              <div className="relative space-y-4">
                <div className="relative inline-block">
                  <Upload className={`mx-auto h-16 w-16 transition-all duration-300 ${
                    isDragging ? 'text-blue-500 scale-110' : 'text-gray-400'
                  }`} />
                  {isDragging && (
                    <div className="absolute inset-0 animate-ping">
                      <Upload className="h-16 w-16 text-blue-400 opacity-75" />
                    </div>
                  )}
                </div>
                <div className="space-y-3">
                  <div>
                    <p className="text-lg font-semibold text-gray-800 mb-2">
                      {isDragging ? 'Drop it like it\'s hot! 🔥' : 'Drag & drop your resume here'}
                    </p>
                    <p className="text-muted-foreground">
                      or{' '}
                      <button
                        onClick={() => fileInputRef.current?.click()}
                        className="text-blue-600 hover:text-blue-700 font-semibold underline decoration-2 underline-offset-2 hover:decoration-blue-700 transition-colors"
                      >
                        browse files
                      </button>
                    </p>
                  </div>
                  <div className="flex flex-wrap justify-center gap-2 text-xs text-muted-foreground">
                    {['PDF', 'DOC', 'DOCX', 'XLS', 'XLSX', 'JPG', 'PNG'].map((type) => (
                      <span key={type} className="bg-gray-100 px-2 py-1 rounded-md font-medium">
                        {type}
                      </span>
                    ))}
                  </div>
                  <p className="text-xs text-muted-foreground">
                    Maximum file size: 10MB
                  </p>
                </div>
              </div>
            )}
          </div>

          {/* Hidden File Input */}
          <input
            ref={fileInputRef}
            type="file"
            accept={allowedTypes.join(',')}
            onChange={handleFileInputChange}
            className="hidden"
          />

          {/* Upload Button */}
          {selectedFile && (
            <Button
              onClick={uploadFile}
              disabled={isUploading}
              className="w-full bg-gradient-to-r from-blue-600 to-purple-600 hover:from-blue-700 hover:to-purple-700 text-white font-semibold py-3 px-6 rounded-xl shadow-lg hover:shadow-xl transform hover:scale-105 transition-all duration-200"
            >
              {isUploading ? (
                <>
                  <div className="animate-spin rounded-full h-5 w-5 border-b-2 border-white mr-3"></div>
                  <span className="text-lg">Uploading your resume...</span>
                </>
              ) : (
                <>
                  <Cloud className="mr-3 h-5 w-5" />
                  <span className="text-lg">Upload Resume</span>
                  <Sparkles className="ml-3 h-5 w-5" />
                </>
              )}
            </Button>
          )}

          {/* Status Message */}
          {uploadMessage && (
            <div className={`flex items-center gap-3 p-4 rounded-xl text-sm font-medium shadow-sm ${
              uploadStatus === 'success'
                ? 'bg-gradient-to-r from-green-50 to-emerald-50 text-green-800 border border-green-200'
                : uploadStatus === 'error'
                ? 'bg-gradient-to-r from-red-50 to-pink-50 text-red-800 border border-red-200'
                : 'bg-gradient-to-r from-blue-50 to-indigo-50 text-blue-800 border border-blue-200'
            }`}>
              {uploadStatus === 'success' && <CheckCircle size={20} className="text-green-600" />}
              {uploadStatus === 'error' && <AlertCircle size={20} className="text-red-600" />}
              <span className="text-base">{uploadMessage}</span>
              {uploadStatus === 'success' && <Sparkles size={16} className="text-yellow-500 animate-pulse" />}
            </div>
          )}
        </div>
      </CardContent>
    </Card>
  );
};

export default ResumeUploader;
