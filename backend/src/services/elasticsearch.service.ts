/**
 * Elasticsearch Service
 * Advanced full-text search for resumes, candidates, and jobs
 */
import { Client } from '@elastic/elasticsearch';

class ElasticsearchService {
  private client: Client | null = null;
  private enabled: boolean;
  private indexResumes: string;
  private indexJobs: string;
  private indexCandidates: string;

  constructor() {
    this.enabled = process.env.ELASTICSEARCH_ENABLED === 'true';
    this.indexResumes = process.env.ELASTICSEARCH_INDEX_RESUMES || 'ats_resumes';
    this.indexJobs = process.env.ELASTICSEARCH_INDEX_JOBS || 'ats_jobs';
    this.indexCandidates = process.env.ELASTICSEARCH_INDEX_CANDIDATES || 'ats_candidates';

    if (this.enabled) {
      this.initialize();
    }
  }

  private async initialize() {
    try {
      this.client = new Client({
        node: process.env.ELASTICSEARCH_URL || 'http://localhost:9200',
      });

      await this.client.ping();
      console.log('Elasticsearch service initialized');
      
      // Create indices if they don't exist
      await this.createIndices();
    } catch (error) {
      console.error('Failed to initialize Elasticsearch:', error);
      this.enabled = false;
    }
  }

  private async createIndices() {
    if (!this.client) return;

    try {
      // Resume index
      const resumeExists = await this.client.indices.exists({ index: this.indexResumes });
      if (!resumeExists) {
        await this.client.indices.create({
          index: this.indexResumes,
          body: {
            mappings: {
              properties: {
                resume_id: { type: 'integer' },
                candidate_id: { type: 'integer' },
                full_name: { type: 'text', analyzer: 'standard' },
                email: { type: 'keyword' },
                phone: { type: 'keyword' },
                raw_text: { type: 'text', analyzer: 'english' },
                skills: { type: 'text', fields: { keyword: { type: 'keyword' } } },
                experience: { type: 'text' },
                education: { type: 'text' },
                current_title: { type: 'text' },
                current_company: { type: 'text' },
                years_of_experience: { type: 'integer' },
                location: { type: 'text' },
                created_at: { type: 'date' }
              }
            }
          }
        });
        console.log(`Created index: ${this.indexResumes}`);
      }

      // Job index
      const jobExists = await this.client.indices.exists({ index: this.indexJobs });
      if (!jobExists) {
        await this.client.indices.create({
          index: this.indexJobs,
          body: {
            mappings: {
              properties: {
                job_id: { type: 'integer' },
                title: { type: 'text', analyzer: 'standard' },
                company: { type: 'text' },
                description: { type: 'text', analyzer: 'english' },
                requirements: { type: 'text' },
                skills: { type: 'text', fields: { keyword: { type: 'keyword' } } },
                location: { type: 'text' },
                employment_type: { type: 'keyword' },
                experience_level: { type: 'keyword' },
                status: { type: 'keyword' },
                created_at: { type: 'date' }
              }
            }
          }
        });
        console.log(`Created index: ${this.indexJobs}`);
      }

      // Candidate index
      const candidateExists = await this.client.indices.exists({ index: this.indexCandidates });
      if (!candidateExists) {
        await this.client.indices.create({
          index: this.indexCandidates,
          body: {
            mappings: {
              properties: {
                candidate_id: { type: 'integer' },
                full_name: { type: 'text', analyzer: 'standard' },
                email: { type: 'keyword' },
                phone: { type: 'keyword' },
                skills: { type: 'text', fields: { keyword: { type: 'keyword' } } },
                experience_summary: { type: 'text' },
                education_summary: { type: 'text' },
                current_title: { type: 'text' },
                current_company: { type: 'text' },
                years_of_experience: { type: 'integer' },
                location: { type: 'text' },
                linkedin_url: { type: 'keyword' },
                github_url: { type: 'keyword' },
                created_at: { type: 'date' }
              }
            }
          }
        });
        console.log(`Created index: ${this.indexCandidates}`);
      }
    } catch (error) {
      console.error('Error creating indices:', error);
    }
  }

  /**
   * Index a resume document
   */
  async indexResume(data: {
    resume_id: number;
    candidate_id?: number;
    full_name?: string;
    email?: string;
    phone?: string;
    raw_text: string;
    skills?: string[];
    experience?: any;
    education?: any;
    current_title?: string;
    current_company?: string;
    years_of_experience?: number;
    location?: string;
  }) {
    if (!this.enabled || !this.client) return;

    try {
      await this.client.index({
        index: this.indexResumes,
        id: data.resume_id.toString(),
        document: {
          ...data,
          skills: Array.isArray(data.skills) ? data.skills.join(', ') : data.skills,
          created_at: new Date()
        }
      });
    } catch (error) {
      console.error('Error indexing resume:', error);
    }
  }

  /**
   * Index a job document
   */
  async indexJob(data: {
    job_id: number;
    title: string;
    company: string;
    description: string;
    requirements?: string;
    skills?: string[];
    location?: string;
    employment_type?: string;
    experience_level?: string;
    status: string;
  }) {
    if (!this.enabled || !this.client) return;

    try {
      await this.client.index({
        index: this.indexJobs,
        id: data.job_id.toString(),
        document: {
          ...data,
          skills: Array.isArray(data.skills) ? data.skills.join(', ') : data.skills,
          created_at: new Date()
        }
      });
    } catch (error) {
      console.error('Error indexing job:', error);
    }
  }

  /**
   * Index a candidate document
   */
  async indexCandidate(data: {
    candidate_id: number;
    full_name?: string;
    email?: string;
    phone?: string;
    skills?: string[];
    experience_summary?: string;
    education_summary?: string;
    current_title?: string;
    current_company?: string;
    years_of_experience?: number;
    location?: string;
    linkedin_url?: string;
    github_url?: string;
  }) {
    if (!this.enabled || !this.client) return;

    try {
      await this.client.index({
        index: this.indexCandidates,
        id: data.candidate_id.toString(),
        document: {
          ...data,
          skills: Array.isArray(data.skills) ? data.skills.join(', ') : data.skills,
          created_at: new Date()
        }
      });
    } catch (error) {
      console.error('Error indexing candidate:', error);
    }
  }

  /**
   * Search resumes with full-text query
   */
  async searchResumes(query: string, options?: {
    from?: number;
    size?: number;
    filters?: any;
  }) {
    if (!this.enabled || !this.client) {
      return null;
    }

    try {
      const result = await this.client.search({
        index: this.indexResumes,
        from: options?.from || 0,
        size: options?.size || 20,
        body: {
          query: {
            bool: {
              must: [
                {
                  multi_match: {
                    query: query,
                    fields: [
                      // Prioritise what matters most for recruiters
                      'skills^4',
                      'current_title^3',
                      'full_name^1',
                      'raw_text',
                      'experience',
                      'education'
                    ],
                    fuzziness: 'AUTO'
                  }
                }
              ],
              should: [
                // Extra boost when skills match strongly
                {
                  match: {
                    skills: {
                      query,
                      boost: 3
                    }
                  }
                },
                // Boost when current_title phrase closely matches query
                {
                  match_phrase: {
                    current_title: {
                      query,
                      boost: 2
                    }
                  }
                }
              ],
              minimum_should_match: 0,
              filter: options?.filters || []
            }
          },
          highlight: {
            fields: {
              raw_text: {},
              skills: {},
              experience: {}
            }
          }
        }
      });

      return {
        total: (result.hits.total as any).value,
        hits: result.hits.hits.map((hit: any) => ({
          ...hit._source,
          score: hit._score,
          highlights: hit.highlight
        }))
      };
    } catch (error) {
      console.error('Error searching resumes:', error);
      return null;
    }
  }

  /**
   * Search jobs with full-text query
   */
  async searchJobs(query: string, options?: {
    from?: number;
    size?: number;
    filters?: any;
  }) {
    if (!this.enabled || !this.client) {
      return null;
    }

    try {
      const result = await this.client.search({
        index: this.indexJobs,
        from: options?.from || 0,
        size: options?.size || 20,
        body: {
          query: {
            // Use function_score so we can add a small recency boost
            function_score: {
              query: {
                bool: {
                  must: [
                    {
                      multi_match: {
                        query: query,
                        fields: [
                          'title^4',
                          'company^2',
                          'skills^3',
                          'description',
                          'requirements'
                        ],
                        fuzziness: 'AUTO'
                      }
                    }
                  ],
                  should: [
                    // Strong boost for close title phrase matches
                    {
                      match_phrase: {
                        title: {
                          query,
                          boost: 4
                        }
                      }
                    },
                    // Extra boost when job skills align well with query
                    {
                      match: {
                        skills: {
                          query,
                          boost: 3
                        }
                      }
                    }
                  ],
                  minimum_should_match: 0,
                  filter: options?.filters || []
                }
              },
              // Slightly favour more recent jobs based on created_at
              functions: [
                {
                  gauss: {
                    created_at: {
                      origin: 'now',
                      scale: '30d',
                      decay: 0.5
                    }
                  },
                  weight: 1.2
                }
              ],
              boost_mode: 'multiply',
              score_mode: 'sum'
            }
          },
          highlight: {
            fields: {
              title: {},
              description: {},
              skills: {}
            }
          }
        }
      });

      return {
        total: (result.hits.total as any).value,
        hits: result.hits.hits.map((hit: any) => ({
          ...hit._source,
          score: hit._score,
          highlights: hit.highlight
        }))
      };
    } catch (error) {
      console.error('Error searching jobs:', error);
      return null;
    }
  }

  /**
   * Get autocomplete suggestions for skills
   */
  async suggestSkills(prefix: string, size: number = 10) {
    if (!this.enabled || !this.client) {
      return null;
    }

    try {
      const result = await this.client.search({
        index: this.indexResumes,
        body: {
          size: 0,
          aggs: {
            skills_suggestions: {
              terms: {
                field: 'skills.keyword',
                include: `${prefix}.*`,
                size: size
              }
            }
          }
        }
      });

      return (result.aggregations?.skills_suggestions as any)?.buckets.map((b: any) => b.key) || [];
    } catch (error) {
      console.error('Error getting skill suggestions:', error);
      return null;
    }
  }

  /**
   * Delete document from index
   */
  async deleteDocument(index: string, id: string) {
    if (!this.enabled || !this.client) return;

    try {
      await this.client.delete({
        index: index,
        id: id
      });
    } catch (error) {
      console.error('Error deleting document:', error);
    }
  }

  /**
   * Bulk reindex from PostgreSQL
   */
  async reindexAll(type: 'resumes' | 'jobs' | 'candidates', documents: any[]) {
    if (!this.enabled || !this.client) return;

    try {
      const index = type === 'resumes' ? this.indexResumes : 
                    type === 'jobs' ? this.indexJobs : this.indexCandidates;

      const body = documents.flatMap(doc => [
        { index: { _index: index, _id: doc[`${type.slice(0, -1)}_id`].toString() } },
        doc
      ]);

      if (body.length > 0) {
        await this.client.bulk({ body });
        console.log(`Reindexed ${documents.length} ${type}`);
      }
    } catch (error) {
      console.error(`Error reindexing ${type}:`, error);
    }
  }
}

export const elasticsearchService = new ElasticsearchService();
export default elasticsearchService;
