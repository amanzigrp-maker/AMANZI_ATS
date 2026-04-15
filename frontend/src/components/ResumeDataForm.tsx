import React, { useState, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import { Separator } from '@/components/ui/separator';
import { 
  User, 
  Mail, 
  Phone, 
  MapPin, 
  Briefcase, 
  GraduationCap, 
  Award, 
  FileText, 
  Save, 
  Edit3, 
  Plus, 
  X,
  CheckCircle,
  AlertCircle
} from 'lucide-react';

interface ParsedResumeData {
  full_name?: string;
  email?: string;
  phone?: string;
  address?: string;
  summary?: string;
  skills?: string[];
  experience?: Array<{
    company?: string;
    position?: string;
    duration?: string;
    description?: string;
  }>;
  education?: Array<{
    institution?: string;
    degree?: string;
    year?: string;
    gpa?: string;
  }>;
  certifications?: string[];
  languages?: string[];
  years_of_experience?: number;
  raw_text?: string;
}

interface ResumeDataFormProps {
  parsedData: ParsedResumeData;
  onSave: (data: ParsedResumeData) => void;
  onCancel: () => void;
  isLoading?: boolean;
}

export const ResumeDataForm: React.FC<ResumeDataFormProps> = ({
  parsedData,
  onSave,
  onCancel,
  isLoading = false
}) => {
  const [formData, setFormData] = useState<ParsedResumeData>(parsedData);
  const [isEditing, setIsEditing] = useState(false);
  const [newSkill, setNewSkill] = useState('');
  const [newCertification, setNewCertification] = useState('');
  const [newLanguage, setNewLanguage] = useState('');

  useEffect(() => {
    console.log('ResumeDataForm received parsedData:', parsedData);
    console.log('ResumeDataForm parsedData keys:', Object.keys(parsedData || {}));
    setFormData(parsedData || {});
  }, [parsedData]);

  // Debug: Log current form data
  console.log('Current formData:', formData);
  console.log('Form data keys:', Object.keys(formData || {}));

  const handleInputChange = (field: keyof ParsedResumeData, value: any) => {
    setFormData(prev => ({
      ...prev,
      [field]: value
    }));
  };

  const addSkill = () => {
    if (newSkill.trim()) {
      const currentSkills = formData.skills || [];
      setFormData(prev => ({
        ...prev,
        skills: [...currentSkills, newSkill.trim()]
      }));
      setNewSkill('');
    }
  };

  const removeSkill = (index: number) => {
    const currentSkills = formData.skills || [];
    setFormData(prev => ({
      ...prev,
      skills: currentSkills.filter((_, i) => i !== index)
    }));
  };

  const addCertification = () => {
    if (newCertification.trim()) {
      const currentCerts = formData.certifications || [];
      setFormData(prev => ({
        ...prev,
        certifications: [...currentCerts, newCertification.trim()]
      }));
      setNewCertification('');
    }
  };

  const removeCertification = (index: number) => {
    const currentCerts = formData.certifications || [];
    setFormData(prev => ({
      ...prev,
      certifications: currentCerts.filter((_, i) => i !== index)
    }));
  };

  const addLanguage = () => {
    if (newLanguage.trim()) {
      const currentLanguages = formData.languages || [];
      setFormData(prev => ({
        ...prev,
        languages: [...currentLanguages, newLanguage.trim()]
      }));
      setNewLanguage('');
    }
  };

  const removeLanguage = (index: number) => {
    const currentLanguages = formData.languages || [];
    setFormData(prev => ({
      ...prev,
      languages: currentLanguages.filter((_, i) => i !== index)
    }));
  };

  const addExperience = () => {
    const currentExp = formData.experience || [];
    setFormData(prev => ({
      ...prev,
      experience: [...currentExp, { company: '', position: '', duration: '', description: '' }]
    }));
  };

  const updateExperience = (index: number, field: string, value: string) => {
    const currentExp = formData.experience || [];
    const updatedExp = currentExp.map((exp, i) => 
      i === index ? { ...exp, [field]: value } : exp
    );
    setFormData(prev => ({
      ...prev,
      experience: updatedExp
    }));
  };

  const removeExperience = (index: number) => {
    const currentExp = formData.experience || [];
    setFormData(prev => ({
      ...prev,
      experience: currentExp.filter((_, i) => i !== index)
    }));
  };

  const addEducation = () => {
    const currentEdu = formData.education || [];
    setFormData(prev => ({
      ...prev,
      education: [...currentEdu, { institution: '', degree: '', year: '', gpa: '' }]
    }));
  };

  const updateEducation = (index: number, field: string, value: string) => {
    const currentEdu = formData.education || [];
    const updatedEdu = currentEdu.map((edu, i) => 
      i === index ? { ...edu, [field]: value } : edu
    );
    setFormData(prev => ({
      ...prev,
      education: updatedEdu
    }));
  };

  const removeEducation = (index: number) => {
    const currentEdu = formData.education || [];
    setFormData(prev => ({
      ...prev,
      education: currentEdu.filter((_, i) => i !== index)
    }));
  };

  const handleSave = () => {
    onSave(formData);
  };

  return (
    <div className="max-w-4xl mx-auto p-6 space-y-6">
      {/* Header */}
      <Card className="bg-gradient-to-r from-blue-50 to-indigo-50 border-blue-200">
        <CardHeader className="pb-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="p-2 bg-blue-500 rounded-lg">
                <FileText className="h-6 w-6 text-white" />
              </div>
              <div>
                <CardTitle className="text-xl text-blue-900">Resume Data Extracted</CardTitle>
                <p className="text-sm text-blue-700 mt-1">Review and edit the parsed information</p>
              </div>
            </div>
            <div className="flex items-center gap-2">
              <Button
                variant="outline"
                size="sm"
                onClick={() => setIsEditing(!isEditing)}
                className="flex items-center gap-2"
              >
                <Edit3 className="h-4 w-4" />
                {isEditing ? 'View Mode' : 'Edit Mode'}
              </Button>
            </div>
          </div>
        </CardHeader>
      </Card>

      {/* Personal Information */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <User className="h-5 w-5 text-blue-600" />
            Personal Information
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="full_name">Full Name</Label>
              <Input
                id="full_name"
                value={formData.full_name || ''}
                onChange={(e) => handleInputChange('full_name', e.target.value)}
                disabled={!isEditing}
                placeholder="Enter full name"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="email">Email</Label>
              <Input
                id="email"
                type="email"
                value={formData.email || ''}
                onChange={(e) => handleInputChange('email', e.target.value)}
                disabled={!isEditing}
                placeholder="Enter email address"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="phone">Phone</Label>
              <Input
                id="phone"
                value={formData.phone || ''}
                onChange={(e) => handleInputChange('phone', e.target.value)}
                disabled={!isEditing}
                placeholder="Enter phone number"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="years_experience">Years of Experience</Label>
              <Input
                id="years_experience"
                type="number"
                value={formData.years_of_experience || ''}
                onChange={(e) => handleInputChange('years_of_experience', parseInt(e.target.value) || 0)}
                disabled={!isEditing}
                placeholder="Enter years of experience"
              />
            </div>
          </div>
          <div className="space-y-2">
            <Label htmlFor="address">Address</Label>
            <Input
              id="address"
              value={formData.address || ''}
              onChange={(e) => handleInputChange('address', e.target.value)}
              disabled={!isEditing}
              placeholder="Enter address"
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="summary">Professional Summary</Label>
            <Textarea
              id="summary"
              value={formData.summary || ''}
              onChange={(e) => handleInputChange('summary', e.target.value)}
              disabled={!isEditing}
              placeholder="Enter professional summary"
              rows={3}
            />
          </div>
        </CardContent>
      </Card>

      {/* Skills */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Award className="h-5 w-5 text-green-600" />
            Skills
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex flex-wrap gap-2">
            {(formData.skills || []).map((skill, index) => (
              <Badge key={index} variant="secondary" className="flex items-center gap-1">
                {skill}
                {isEditing && (
                  <button
                    onClick={() => removeSkill(index)}
                    className="ml-1 text-red-500 hover:text-red-700"
                  >
                    <X className="h-3 w-3" />
                  </button>
                )}
              </Badge>
            ))}
          </div>
          {isEditing && (
            <div className="flex gap-2">
              <Input
                value={newSkill}
                onChange={(e) => setNewSkill(e.target.value)}
                placeholder="Add new skill"
                onKeyPress={(e) => e.key === 'Enter' && addSkill()}
              />
              <Button onClick={addSkill} size="sm">
                <Plus className="h-4 w-4" />
              </Button>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Experience */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Briefcase className="h-5 w-5 text-purple-600" />
            Work Experience
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          {(formData.experience || []).map((exp, index) => (
            <div key={index} className="p-4 border rounded-lg space-y-3">
              <div className="flex justify-between items-start">
                <h4 className="font-medium">Experience #{index + 1}</h4>
                {isEditing && (
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => removeExperience(index)}
                    className="text-red-500 hover:text-red-700"
                  >
                    <X className="h-4 w-4" />
                  </Button>
                )}
              </div>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                <div className="space-y-2">
                  <Label>Company</Label>
                  <Input
                    value={exp.company || ''}
                    onChange={(e) => updateExperience(index, 'company', e.target.value)}
                    disabled={!isEditing}
                    placeholder="Company name"
                  />
                </div>
                <div className="space-y-2">
                  <Label>Position</Label>
                  <Input
                    value={exp.position || ''}
                    onChange={(e) => updateExperience(index, 'position', e.target.value)}
                    disabled={!isEditing}
                    placeholder="Job title"
                  />
                </div>
              </div>
              <div className="space-y-2">
                <Label>Duration</Label>
                <Input
                  value={exp.duration || ''}
                  onChange={(e) => updateExperience(index, 'duration', e.target.value)}
                  disabled={!isEditing}
                  placeholder="e.g., Jan 2020 - Dec 2022"
                />
              </div>
              <div className="space-y-2">
                <Label>Description</Label>
                <Textarea
                  value={exp.description || ''}
                  onChange={(e) => updateExperience(index, 'description', e.target.value)}
                  disabled={!isEditing}
                  placeholder="Job responsibilities and achievements"
                  rows={2}
                />
              </div>
            </div>
          ))}
          {isEditing && (
            <Button onClick={addExperience} variant="outline" className="w-full">
              <Plus className="h-4 w-4 mr-2" />
              Add Experience
            </Button>
          )}
        </CardContent>
      </Card>

      {/* Education */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <GraduationCap className="h-5 w-5 text-blue-600" />
            Education
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          {(formData.education || []).map((edu, index) => (
            <div key={index} className="p-4 border rounded-lg space-y-3">
              <div className="flex justify-between items-start">
                <h4 className="font-medium">Education #{index + 1}</h4>
                {isEditing && (
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => removeEducation(index)}
                    className="text-red-500 hover:text-red-700"
                  >
                    <X className="h-4 w-4" />
                  </Button>
                )}
              </div>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                <div className="space-y-2">
                  <Label>Institution</Label>
                  <Input
                    value={edu.institution || ''}
                    onChange={(e) => updateEducation(index, 'institution', e.target.value)}
                    disabled={!isEditing}
                    placeholder="University/School name"
                  />
                </div>
                <div className="space-y-2">
                  <Label>Degree</Label>
                  <Input
                    value={edu.degree || ''}
                    onChange={(e) => updateEducation(index, 'degree', e.target.value)}
                    disabled={!isEditing}
                    placeholder="Degree/Qualification"
                  />
                </div>
                <div className="space-y-2">
                  <Label>Year</Label>
                  <Input
                    value={edu.year || ''}
                    onChange={(e) => updateEducation(index, 'year', e.target.value)}
                    disabled={!isEditing}
                    placeholder="Graduation year"
                  />
                </div>
                <div className="space-y-2">
                  <Label>GPA/Grade</Label>
                  <Input
                    value={edu.gpa || ''}
                    onChange={(e) => updateEducation(index, 'gpa', e.target.value)}
                    disabled={!isEditing}
                    placeholder="GPA or grade"
                  />
                </div>
              </div>
            </div>
          ))}
          {isEditing && (
            <Button onClick={addEducation} variant="outline" className="w-full">
              <Plus className="h-4 w-4 mr-2" />
              Add Education
            </Button>
          )}
        </CardContent>
      </Card>

      {/* Certifications */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Award className="h-5 w-5 text-yellow-600" />
            Certifications
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex flex-wrap gap-2">
            {(formData.certifications || []).map((cert, index) => (
              <Badge key={index} variant="outline" className="flex items-center gap-1">
                {cert}
                {isEditing && (
                  <button
                    onClick={() => removeCertification(index)}
                    className="ml-1 text-red-500 hover:text-red-700"
                  >
                    <X className="h-3 w-3" />
                  </button>
                )}
              </Badge>
            ))}
          </div>
          {isEditing && (
            <div className="flex gap-2">
              <Input
                value={newCertification}
                onChange={(e) => setNewCertification(e.target.value)}
                placeholder="Add new certification"
                onKeyPress={(e) => e.key === 'Enter' && addCertification()}
              />
              <Button onClick={addCertification} size="sm">
                <Plus className="h-4 w-4" />
              </Button>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Languages */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <MapPin className="h-5 w-5 text-indigo-600" />
            Languages
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex flex-wrap gap-2">
            {(formData.languages || []).map((lang, index) => (
              <Badge key={index} variant="outline" className="flex items-center gap-1">
                {lang}
                {isEditing && (
                  <button
                    onClick={() => removeLanguage(index)}
                    className="ml-1 text-red-500 hover:text-red-700"
                  >
                    <X className="h-3 w-3" />
                  </button>
                )}
              </Badge>
            ))}
          </div>
          {isEditing && (
            <div className="flex gap-2">
              <Input
                value={newLanguage}
                onChange={(e) => setNewLanguage(e.target.value)}
                placeholder="Add new language"
                onKeyPress={(e) => e.key === 'Enter' && addLanguage()}
              />
              <Button onClick={addLanguage} size="sm">
                <Plus className="h-4 w-4" />
              </Button>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Action Buttons */}
      <div className="flex justify-end gap-3 pt-6">
        <Button variant="outline" onClick={onCancel}>
          Cancel
        </Button>
        <Button onClick={handleSave} disabled={isLoading} className="flex items-center gap-2">
          {isLoading ? (
            <>
              <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white"></div>
              Saving...
            </>
          ) : (
            <>
              <Save className="h-4 w-4" />
              Save Resume Data
            </>
          )}
        </Button>
      </div>
    </div>
  );
};

export default ResumeDataForm;
